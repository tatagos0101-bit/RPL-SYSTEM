"""Shared commitment accounting. Callers lock the member before creating slots."""
from fastapi import HTTPException
from sqlalchemy import or_, and_
from models.user import User
from models.book import Book
from models.transaction import Transaction
from models.reservation import Reservation
from timezone_utils import now_ph

COMMITMENT_LIMIT = 5


def active_reservation_filter():
    return or_(Reservation.status == 'pending', and_(Reservation.status == 'ready',
        or_(Reservation.expires_at.is_(None), Reservation.expires_at > now_ph())))


def lock_member(db, user_id):
    # PostgreSQL NO KEY UPDATE still serializes commitment writers, while allowing
    # queue notifications to reference another locked member through their FK.
    member = db.query(User).filter(User.id == user_id).with_for_update(key_share=True).populate_existing().first()
    if member is None:
        raise HTTPException(404, 'Member not found')
    return member


def lock_books(db, book_ids):
    return {book.id: book for book in db.query(Book).filter(Book.id.in_(sorted(set(book_ids))))
            .order_by(Book.id).with_for_update().populate_existing().all()}


def borrowing_capacity(db, user_id):
    loans = db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.status.in_(['active', 'overdue']))
    loan_count = loans.count()
    overdue = loans.filter(or_(Transaction.status == 'overdue', Transaction.due_date <= now_ph())).count()
    reservations = db.query(Reservation).filter(Reservation.user_id == user_id, active_reservation_filter())
    pending = reservations.filter(Reservation.status == 'pending').count()
    ready = reservations.filter(Reservation.status == 'ready').count()
    member = db.get(User, user_id)
    restrictions = []
    if overdue:
        restrictions.append('Return overdue books before borrowing.')
    if member and member.status == 'suspended':
        restrictions.append('Account is suspended.')
    remaining = max(0, COMMITMENT_LIMIT - loan_count - pending - ready)
    if not remaining:
        restrictions.append('All five slots are in use. Return or cancel a book to free a slot.')
    return dict(limit=COMMITMENT_LIMIT, active_loans=loan_count, pending_reservations=pending,
                ready_reservations=ready, remaining_slots=remaining, borrowing_restrictions=restrictions)


def assert_slots(db, user_id, additional=1):
    capacity = borrowing_capacity(db, user_id)
    if additional > capacity['remaining_slots']:
        raise HTTPException(409, dict(code='quota_exceeded', message='The five-book combined limit would be exceeded.', capacity=capacity))
    return capacity


def free_title_capacity(db, book):
    held = db.query(Reservation).filter(Reservation.book_id == book.id, Reservation.status == 'ready', active_reservation_filter()).count()
    return max(0, book.copies_available - held)
