from uuid import uuid4
from services.reservation_confirmation import confirm_reservations, cancel_locked_reservation
from services.borrowing_capacity import borrowing_capacity
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
from dependencies import require_member
from models.book import Book
from models.notification import Notification
from models.reservation import Reservation
from models.user import User
from schemas.reservation import ReservationRequest, ReservationOut, ReservationConfirmRequest
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
    current_user: User    = Depends(require_member),
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
    current_user: User    = Depends(require_member),
    db:           Session = Depends(get_db),
):
    rows = confirm_reservations(db, current_user.id, [body], uuid4())
    db.commit()
    return _enrich(rows[0])


@router.post("/confirm", status_code=201)
def confirm_batch(body: ReservationConfirmRequest, current_user: User = Depends(require_member), db: Session = Depends(get_db)):
    rows = confirm_reservations(db, current_user.id, body.selections, body.request_id)
    db.commit()
    return {"reservations": [_enrich(row) for row in rows], "capacity": borrowing_capacity(db, current_user.id)}

# ── Cancel a reservation ──────────────────────────────────────────────────────

@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_reservation(
    reservation_id: int,
    current_user:   User    = Depends(require_member),
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
    cancel_locked_reservation(db, reservation)
    db.commit()
