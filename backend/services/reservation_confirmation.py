"""Atomic confirmations. Lock order: requesting member, then ascending titles."""
import hashlib
import json
from datetime import timedelta
from fastapi import HTTPException
from models.reservation import Reservation, ReservationConfirmation
from models.transaction import Transaction
from models.notification import Notification
from services.borrowing_capacity import lock_member, lock_books, assert_slots, free_title_capacity
from services.reservation_policy import sync_expired_reservations, renumber_pending_queue
from timezone_utils import now_ph
from config import PICKUP_WINDOW_HOURS


def confirm_reservations(db, user_id, selections, request_id):
    member = lock_member(db, user_id)
    if member.role != 'member' or member.status != 'active':
        raise HTTPException(403, 'Active member access required')
    ordered = sorted(selections, key=lambda item: item.book_id)
    fingerprint = hashlib.sha256(json.dumps([item.model_dump() for item in ordered], sort_keys=True).encode()).hexdigest()
    previous = db.get(ReservationConfirmation, (user_id, str(request_id)))
    if previous:
        if previous.fingerprint != fingerprint:
            raise HTTPException(409, dict(code='confirmation_id_conflict', message='This confirmation ID was used for different selections.'))
        rows = {r.id: r for r in db.query(Reservation).filter(Reservation.id.in_(previous.reservation_ids)).all()}
        return [rows[rid] for rid in previous.reservation_ids]
    books = lock_books(db, [item.book_id for item in ordered])
    if len(books) != len(ordered):
        raise HTTPException(404, 'A selected book no longer exists')
    for book_id in books:
        sync_expired_reservations(db, book_id=book_id, commit=False)
    assert_slots(db, user_id, len(ordered))
    ids = list(books)
    existing = db.query(Reservation).filter(Reservation.user_id == user_id, Reservation.book_id.in_(ids),
                                          Reservation.status.in_(['pending', 'ready'])).first()
    if existing:
        raise HTTPException(409, dict(code='duplicate_reservation', message='You already reserved a selected title.', book_id=existing.book_id))
    if db.query(Transaction.id).filter(Transaction.user_id == user_id, Transaction.book_id.in_(ids),
                                      Transaction.status.in_(['active', 'overdue'])).first():
        raise HTTPException(409, dict(code='already_borrowed', message='You already have a selected title on loan.'))
    availability = {bid: free_title_capacity(db, book) for bid, book in books.items()}
    changed = [dict(book_id=item.book_id, available=availability[item.book_id], status='pending')
               for item in ordered if availability[item.book_id] == 0 and not item.accept_queue]
    if changed:
        raise HTTPException(409, dict(code='availability_changed', message='Availability changed. Agree to queue these titles before confirming.', books=changed))
    rows = []
    for item in selections:
        book = books[item.book_id]
        ready = availability[book.id] > 0
        reservation = Reservation(user_id=user_id, book_id=book.id, status='ready' if ready else 'pending',
                                  reserved_at=now_ph(), expires_at=now_ph() + timedelta(hours=PICKUP_WINDOW_HOURS) if ready else None)
        db.add(reservation); db.flush()
        renumber_pending_queue(db, book.id)
        db.add(Notification(message=f'{member.name} reserved "{book.title}"', type='reservation',
                            member_name=member.name, book_title=book.title, reservation_id=reservation.id))
        if ready:
            db.add(Notification(user_id=user_id, message=f'Your reservation for "{book.title}" is ready for pickup! You have {PICKUP_WINDOW_HOURS} hours to collect it.',
                                type='reservation_ready', book_title=book.title, reservation_id=reservation.id))
        rows.append(reservation)
    db.add(ReservationConfirmation(user_id=user_id, request_id=str(request_id), fingerprint=fingerprint,
                                   reservation_ids=[r.id for r in rows]))
    db.flush()
    return rows


def cancel_locked_reservation(db, reservation):
    lock_member(db, reservation.user_id)
    lock_books(db, [reservation.book_id])
    db.refresh(reservation)
    if reservation.status not in ('pending', 'ready', 'cancelled'):
        raise HTTPException(409, 'Reservation is already fulfilled')
    reservation.status = 'cancelled'
    db.flush()
    sync_expired_reservations(db, book_id=reservation.book_id, commit=False)
    renumber_pending_queue(db, reservation.book_id)
