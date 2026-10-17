from datetime import timedelta

import pytest
from fastapi import HTTPException

from models.book import Book
from models.book_copy import BookCopy
from models.reservation import Reservation
from models.transaction import Transaction
from models.user import User
from routers.transactions import borrow_book
from schemas.transaction import BorrowRequest
from services.book_copy_service import ensure_book_copies, select_available_copy
from timezone_utils import now_ph


def test_copy_preparation_is_repeatable_without_committing(db_session):
    book = Book(title="Synthetic legacy book", author="Test", category="Test", copies_total=2, copies_available=2)
    db_session.add(book)
    db_session.commit()
    assert book.copies == []  # Exercise the previously cached empty relationship.
    ensure_book_copies(db_session, book.id, commit=False)
    assert select_available_copy(db_session, book.id, commit=False) is not None
    assert db_session.query(BookCopy).filter_by(book_id=book.id).count() == 2
    db_session.rollback()
    assert db_session.query(BookCopy).filter_by(book_id=book.id).count() == 0


def test_rejected_borrow_rolls_back_copy_preparation_and_reservation_expiry(db_session):
    user = User(name="Synthetic borrower", role="member", password_hash="unused")
    book = Book(title="Synthetic book", author="Test", category="Test", copies_total=1, copies_available=1)
    db_session.add_all([user, book])
    db_session.flush()
    reservation = Reservation(user_id=user.id, book_id=book.id, status="ready",
                              expires_at=now_ph() - timedelta(minutes=1))
    db_session.add(reservation)
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        borrow_book(BorrowRequest(user_id=user.id, book_id=book.id, copy_id=999999), db_session, None)
    assert error.value.status_code == 404
    db_session.rollback()
    assert db_session.query(BookCopy).count() == 0
    assert db_session.query(Transaction).count() == 0
    db_session.refresh(reservation)
    assert reservation.status == "ready"
    db_session.refresh(book)
    assert book.copies_available == 1
