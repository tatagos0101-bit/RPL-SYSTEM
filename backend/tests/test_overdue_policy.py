from datetime import timedelta

import pytest
from fastapi import HTTPException

from config import FINE_PER_DAY
from models.book import Book
from models.transaction import Transaction
from models.user import User
from routers.auth import _hash
from services.loan_policy import (
    OVERDUE_BORROW_BLOCK_MESSAGE,
    assert_can_borrow,
    member_has_overdue,
    sync_overdue_loans,
)
from timezone_utils import now_ph


def create_member(db, name="Member", email="member@example.test"):
    user = User(
        name=name,
        email=email,
        password_hash=_hash("Password1"),
        role="member",
        member_id="RPL-MEM01",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_librarian(db):
    user = User(
        name="Librarian",
        email="lib@example.test",
        password_hash=_hash("Password1"),
        role="librarian",
        member_id="RPL-LIB01",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_book(db, title="Test Book", available=1):
    book = Book(
        title=title,
        author="Author",
        category="General",
        copies_total=1,
        copies_available=available,
        qr_code=f"QR-{title.replace(' ', '-')}",
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


def login(client, email, password="Password1"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_sync_overdue_loans_converts_due_active_loans_and_blocks_borrow(db_session):
    member = create_member(db_session)
    book = create_book(db_session)
    tx = Transaction(
        user_id=member.id,
        book_id=book.id,
        type="borrow",
        status="active",
        borrow_date=now_ph() - timedelta(days=20),
        due_date=now_ph() - timedelta(days=1),
    )
    db_session.add(tx)
    db_session.commit()

    changed = sync_overdue_loans(db_session, user_id=member.id)

    assert changed == 1
    db_session.refresh(tx)
    assert tx.status == "overdue"
    assert member_has_overdue(db_session, member.id) is True
    with pytest.raises(HTTPException) as exc:
        assert_can_borrow(db_session, member.id)
    assert exc.value.status_code == 409
    assert exc.value.detail == OVERDUE_BORROW_BLOCK_MESSAGE


def test_borrow_blocks_member_with_overdue_and_return_accepts_overdue_loan(client, db_session):
    member = create_member(db_session)
    librarian = create_librarian(db_session)
    overdue_book = create_book(db_session, "Overdue Book", available=0)
    next_book = create_book(db_session, "Next Book", available=1)
    tx = Transaction(
        user_id=member.id,
        book_id=overdue_book.id,
        type="borrow",
        status="active",
        borrow_date=now_ph() - timedelta(days=20),
        due_date=now_ph() - timedelta(days=2),
    )
    db_session.add(tx)
    db_session.commit()
    token = login(client, librarian.email)

    blocked = client.post(
        "/api/transactions/borrow",
        headers={"Authorization": f"Bearer {token}"},
        json={"user_id": member.id, "book_id": next_book.id},
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == OVERDUE_BORROW_BLOCK_MESSAGE

    returned = client.post(
        "/api/transactions/return",
        headers={"Authorization": f"Bearer {token}"},
        json={"user_id": member.id, "book_id": overdue_book.id},
    )
    assert returned.status_code == 200
    body = returned.json()
    assert body["status"] == "returned"
    assert float(body["fine_amount"]) >= FINE_PER_DAY

    allowed = client.post(
        "/api/transactions/borrow",
        headers={"Authorization": f"Bearer {token}"},
        json={"user_id": member.id, "book_id": next_book.id},
    )
    assert allowed.status_code == 201


def test_overdue_status_is_visible_in_transactions_loans_fines_and_librarian_views(client, db_session):
    member = create_member(db_session)
    librarian = create_librarian(db_session)
    book = create_book(db_session, available=0)
    tx = Transaction(
        user_id=member.id,
        book_id=book.id,
        type="borrow",
        status="active",
        borrow_date=now_ph() - timedelta(days=20),
        due_date=now_ph() - timedelta(days=3),
    )
    db_session.add(tx)
    db_session.commit()
    lib_token = login(client, librarian.email)
    member_token = login(client, member.email)

    transactions = client.get(
        "/api/transactions?status=overdue",
        headers={"Authorization": f"Bearer {lib_token}"},
    )
    assert transactions.status_code == 200
    assert [item["id"] for item in transactions.json()] == [tx.id]
    assert transactions.json()[0]["status"] == "overdue"

    loans = client.get("/api/user/loans", headers={"Authorization": f"Bearer {member_token}"})
    assert loans.status_code == 200
    assert loans.json()[0]["transaction_id"] == tx.id

    fines = client.get("/api/user/fines", headers={"Authorization": f"Bearer {member_token}"})
    assert fines.status_code == 200
    assert fines.json()["overdue_loans"][0]["transaction_id"] == tx.id

    due_books = client.get(
        "/api/librarian/due-books?filter=overdue",
        headers={"Authorization": f"Bearer {lib_token}"},
    )
    assert due_books.status_code == 200
    assert due_books.json()[0]["transaction_id"] == tx.id
    assert due_books.json()[0]["status"] == "overdue"

    stats = client.get("/api/librarian/stats", headers={"Authorization": f"Bearer {lib_token}"})
    assert stats.status_code == 200
    assert stats.json()["overdue_count"] == 1
