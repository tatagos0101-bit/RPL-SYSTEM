"""
Reservation endpoints — member side.

A reservation means a member wants a book that is currently unavailable (0 copies).
When a copy is returned, the first person in the queue gets notified (status → "ready").
"""
from datetime import datetime, timedelta

from timezone_utils import now_ph

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config import PICKUP_WINDOW_HOURS
from database import get_db
from dependencies import get_current_user
from models.book import Book
from models.notification import Notification
from models.reservation import Reservation
from models.user import User
from schemas.reservation import ReservationRequest, ReservationOut
from services.reservation_policy import (
    promote_next_pending_reservation,
    renumber_pending_queue,
    sync_expired_reservations,
)

router = APIRouter(prefix="/api/reservations", tags=["Reservations"])


def _now() -> datetime:
    return now_ph()


def _enrich(r: Reservation) -> ReservationOut:
    return ReservationOut(
        id             = r.id,
        book_id        = r.book_id,
        book_title     = r.book.title     if r.book else "Unknown",
        book_author    = r.book.author    if r.book else "",
        cover_url      = r.book.cover_url if r.book else None,
        status         = r.status,
        queue_position = r.queue_position,
        reserved_at    = r.reserved_at,
        expires_at     = r.expires_at,
    )


# ── Get my reservations ───────────────────────────────────────────────────────

@router.get("", response_model=list[ReservationOut])
def my_reservations(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    sync_expired_reservations(db, user_id=current_user.id)
    reservations = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == current_user.id,
            Reservation.status.in_(["pending", "ready"]),
        )
        .order_by(Reservation.reserved_at)
        .all()
    )
    return [_enrich(r) for r in reservations]


# ── Reserve a book ────────────────────────────────────────────────────────────

@router.post("", response_model=ReservationOut, status_code=status.HTTP_201_CREATED)
def reserve_book(
    body:         ReservationRequest,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    sync_expired_reservations(db, book_id=body.book_id)
    book = db.query(Book).filter(Book.id == body.book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Already reserved by this member?
    existing = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == current_user.id,
            Reservation.book_id == body.book_id,
            Reservation.status.in_(["pending", "ready"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="You already have a reservation for this book")

    # Count how many are ahead in queue
    queue_ahead = (
        db.query(Reservation)
        .filter(Reservation.book_id == body.book_id, Reservation.status == "pending")
        .count()
    )

    # If book is available right now, mark as ready immediately
    initial_status = "ready" if book.copies_available > 0 else "pending"
    expires        = _now() + timedelta(hours=PICKUP_WINDOW_HOURS) if initial_status == "ready" else None

    reservation = Reservation(
        user_id        = current_user.id,
        book_id        = body.book_id,
        status         = initial_status,
        queue_position = queue_ahead + 1,
        expires_at     = expires,
    )
    db.add(reservation)
    db.flush()  # get reservation.id before commit

    # Notify librarians of the new reservation
    status_label = "ready for pickup" if initial_status == "ready" else f"queued (position {queue_ahead + 1})"
    db.add(Notification(
        message        = f"{current_user.name} reserved \"{book.title}\" — {status_label}",
        type           = "reservation",
        member_name    = current_user.name,
        book_title     = book.title,
        reservation_id = reservation.id,
    ))

    # Notify the user if the book is immediately available
    if initial_status == "ready":
        db.add(Notification(
            user_id        = current_user.id,
            message        = f'Your reservation for "{book.title}" is ready for pickup! You have {PICKUP_WINDOW_HOURS} hours to collect it.',
            type           = "reservation_ready",
            book_title     = book.title,
            reservation_id = reservation.id,
        ))

    db.commit()
    db.refresh(reservation)
    return _enrich(reservation)


# ── Cancel a reservation ──────────────────────────────────────────────────────

@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_reservation(
    reservation_id: int,
    current_user:   User    = Depends(get_current_user),
    db:             Session = Depends(get_db),
):
    reservation = (
        db.query(Reservation)
        .filter(
            Reservation.id      == reservation_id,
            Reservation.user_id == current_user.id,
        )
        .first()
    )
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if reservation.status not in ("pending", "ready"):
        raise HTTPException(status_code=400, detail="Reservation is already fulfilled or cancelled")

    original_status = reservation.status
    reservation.status = "cancelled"

    renumber_pending_queue(db, reservation.book_id)
    if original_status == "ready":
        promote_next_pending_reservation(db, reservation.book_id)

    db.commit()
