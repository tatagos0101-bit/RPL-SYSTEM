from datetime import timedelta
from io import BytesIO

from pypdf import PdfReader

from models.book import Book
from models.book_copy import BookCopy
from models.transaction import Transaction
from models.user import User
from routers.auth import _hash
from services.book_copy_service import ensure_book_copies
from timezone_utils import now_ph


def create_librarian(db):
    user = User(
        name="QR Librarian",
        email="qr-librarian@example.test",
        password_hash=_hash("Password1"),
        role="librarian",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_member(db):
    user = User(
        name="QR Member",
        email="qr-member@example.test",
        password_hash=_hash("Password1"),
        role="member",
        member_id="RPL-QR-MEMBER",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_book(db, copies=3, available=None):
    available = copies if available is None else available
    book = Book(
        title="Copy QR Book",
        author="Rizal Library",
        category="Reference",
        copies_total=copies,
        copies_available=available,
        qr_code="RPL-00001",
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


def login(client, email, password="Password1"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def test_existing_books_are_backfilled_with_new_copy_qr_codes(db_session):
    book = create_book(db_session, copies=3)

    ensure_book_copies(db_session)

    copies = (
        db_session.query(BookCopy)
        .filter(BookCopy.book_id == book.id)
        .order_by(BookCopy.copy_number)
        .all()
    )
    assert [copy.copy_number for copy in copies] == [1, 2, 3]
    assert [copy.qr_code for copy in copies] == [
        f"RPL-BOOK-{book.id:05d}-C001",
        f"RPL-BOOK-{book.id:05d}-C002",
        f"RPL-BOOK-{book.id:05d}-C003",
    ]
    assert {copy.status for copy in copies} == {"available"}


def test_backfill_assigns_active_legacy_loans_to_borrowed_copies(db_session):
    member = create_member(db_session)
    book = create_book(db_session, copies=2, available=1)
    tx = Transaction(
        user_id=member.id,
        book_id=book.id,
        type="borrow",
        status="active",
        borrow_date=now_ph(),
        due_date=now_ph() + timedelta(days=7),
    )
    db_session.add(tx)
    db_session.commit()

    ensure_book_copies(db_session)
    db_session.refresh(tx)

    copies = db_session.query(BookCopy).filter(BookCopy.book_id == book.id).all()
    assert sorted(copy.status for copy in copies) == ["available", "borrowed"]
    assert tx.copy_id in {copy.id for copy in copies}
    assert db_session.get(BookCopy, tx.copy_id).status == "borrowed"


def test_scan_endpoint_accepts_new_copy_qr_and_legacy_book_qr(client, db_session):
    book = create_book(db_session, copies=2)
    ensure_book_copies(db_session)
    copy = (
        db_session.query(BookCopy)
        .filter(BookCopy.book_id == book.id, BookCopy.copy_number == 1)
        .one()
    )

    copy_response = client.get(f"/api/books/scan/{copy.qr_code.lower()}%0A")
    legacy_response = client.get(f"/api/books/scan/{book.qr_code}")

    assert copy_response.status_code == 200
    assert copy_response.json()["qr_type"] == "copy"
    assert copy_response.json()["book"]["id"] == book.id
    assert copy_response.json()["copy"]["qr_code"] == copy.qr_code
    assert copy_response.json()["can_borrow"] is True

    assert legacy_response.status_code == 200
    assert legacy_response.json()["qr_type"] == "book"
    assert legacy_response.json()["book"]["id"] == book.id
    assert legacy_response.json()["copy"] is None
    assert legacy_response.json()["can_borrow"] is True


def test_borrow_and_return_by_copy_id_updates_only_that_copy(client, db_session):
    librarian = create_librarian(db_session)
    member = create_member(db_session)
    book = create_book(db_session, copies=2)
    ensure_book_copies(db_session)
    copy_one = (
        db_session.query(BookCopy)
        .filter(BookCopy.book_id == book.id, BookCopy.copy_number == 1)
        .one()
    )
    copy_two = (
        db_session.query(BookCopy)
        .filter(BookCopy.book_id == book.id, BookCopy.copy_number == 2)
        .one()
    )
    token = login(client, librarian.email)
    headers = {"Authorization": f"Bearer {token}"}

    borrow_response = client.post(
        "/api/transactions/borrow",
        json={"user_id": member.id, "book_id": book.id, "copy_id": copy_one.id},
        headers=headers,
    )

    assert borrow_response.status_code == 201
    assert borrow_response.json()["copy_id"] == copy_one.id
    assert borrow_response.json()["copy_qr"] == copy_one.qr_code
    assert borrow_response.json()["copy_number"] == 1
    db_session.refresh(book)
    db_session.refresh(copy_one)
    db_session.refresh(copy_two)
    assert book.copies_available == 1
    assert copy_one.status == "borrowed"
    assert copy_two.status == "available"

    return_response = client.post(
        "/api/transactions/return",
        json={"user_id": member.id, "book_id": book.id, "copy_id": copy_one.id},
        headers=headers,
    )

    assert return_response.status_code == 200
    assert return_response.json()["copy_id"] == copy_one.id
    db_session.refresh(book)
    db_session.refresh(copy_one)
    assert book.copies_available == 2
    assert copy_one.status == "available"


def test_borrow_blocks_copy_statuses_that_are_not_available(client, db_session):
    librarian = create_librarian(db_session)
    member = create_member(db_session)
    book = create_book(db_session, copies=1)
    ensure_book_copies(db_session)
    copy = db_session.query(BookCopy).filter(BookCopy.book_id == book.id).one()
    copy.status = "damaged"
    db_session.commit()
    token = login(client, librarian.email)

    response = client.post(
        "/api/transactions/borrow",
        json={"user_id": member.id, "book_id": book.id, "copy_id": copy.id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "This physical copy is damaged and cannot be borrowed."


def test_bulk_qr_pdf_prints_copy_level_labels(client, db_session):
    librarian = create_librarian(db_session)
    book = create_book(db_session, copies=2)
    ensure_book_copies(db_session)
    token = login(client, librarian.email)

    response = client.post(
        "/api/inventory/books/qr-pdf",
        json=[book.id],
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    text = pdf_text(response.content)
    assert f"RPL-BOOK-{book.id:05d}-C001" in text
    assert f"RPL-BOOK-{book.id:05d}-C002" in text
    assert "Copy 1" in text
    assert "Copy 2" in text
