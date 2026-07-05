from datetime import datetime, timedelta
from io import BytesIO

from pypdf import PdfReader

from models.book import Book
from models.entry_log import EntryLog
from models.transaction import Transaction
from models.user import User
from routers.auth import _hash
from services.report_service import build_monthly_report
from timezone_utils import PH_TZ


def pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def create_librarian(db):
    user = User(
        name="Report Librarian",
        email="report-librarian@example.test",
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
        name="Report Member",
        email="report-member@example.test",
        password_hash=_hash("Password1"),
        role="member",
        member_id="RPL-REPORT",
        status="active",
        created_at=datetime(2026, 7, 3, 9, 0, tzinfo=PH_TZ),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login(client, email, password="Password1"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_monthly_report_service_uses_clear_report_card_sections():
    pdf = build_monthly_report(
        "July 2026",
        {
            "borrows": 18,
            "returns": 14,
            "active_members": 9,
            "new_members": 3,
            "overdue": 2,
            "fines": 45.5,
            "visits": 42,
            "denied_visits": 4,
            "book_titles": 120,
            "total_copies": 300,
            "available_copies": 210,
            "borrowed_copies": 90,
        },
        [
            {"title": "Noli Me Tangere", "author": "Jose Rizal", "category": "Novel", "borrows": 7},
            ("El Filibusterismo", "Jose Rizal", "Novel", 4),
        ],
        [
            {"member_id": "RPL-00001", "name": "Ana Reyes", "borrows": 5},
            ("RPL-00002", "Ben Cruz", 3),
        ],
    )

    text = pdf_text(pdf)

    assert "Monthly Library Report Card" in text
    assert "What this report is for" in text
    assert "What happened this month" in text
    assert "Visitor Summary" in text
    assert "Book Collection" in text
    assert "Monthly Visitors" in text
    assert "Total Copies" in text
    assert "9 active member" in text
    assert "Top Borrowed Books" in text
    assert "Most Active Members" in text
    assert "El Filibusterismo" in text
    assert "RPL-00002" in text


def test_monthly_report_endpoint_includes_visitor_and_collection_counts(client, db_session):
    librarian = create_librarian(db_session)
    member = create_member(db_session)
    book_one = Book(
        title="Noli Me Tangere",
        author="Jose Rizal",
        category="Novel",
        copies_total=3,
        copies_available=2,
        qr_code="RPT-BOOK-1",
    )
    book_two = Book(
        title="El Filibusterismo",
        author="Jose Rizal",
        category="Novel",
        copies_total=1,
        copies_available=1,
        qr_code="RPT-BOOK-2",
    )
    db_session.add_all([book_one, book_two])
    db_session.commit()
    db_session.refresh(book_one)

    borrow_date = datetime(2026, 7, 5, 10, 0, tzinfo=PH_TZ)
    db_session.add(Transaction(
        user_id=member.id,
        book_id=book_one.id,
        type="borrow",
        status="active",
        borrow_date=borrow_date,
        due_date=borrow_date + timedelta(days=7),
    ))
    db_session.add_all([
        EntryLog(user_id=member.id, granted=True, accessed_at=datetime(2026, 7, 5, 8, 0, tzinfo=PH_TZ)),
        EntryLog(user_id=member.id, granted=True, accessed_at=datetime(2026, 7, 6, 8, 0, tzinfo=PH_TZ)),
        EntryLog(user_id=None, granted=False, note="Unknown visitor", accessed_at=datetime(2026, 7, 7, 8, 0, tzinfo=PH_TZ)),
    ])
    db_session.commit()
    token = login(client, librarian.email)

    response = client.get(
        "/api/reports/monthly?month=7&year=2026",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    text = pdf_text(response.content)
    assert "Monthly Visitors" in text
    assert "Denied Scans" in text
    assert "Book Titles" in text
    assert "Total Copies" in text
