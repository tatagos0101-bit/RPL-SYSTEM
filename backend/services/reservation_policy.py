from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from config import PICKUP_WINDOW_HOURS
from models.book import Book
from models.notification import Notification
from models.reservation import Reservation
from timezone_utils import now_ph


def _now() -> datetime:
    return now_ph()


def renumber_pending_queue(db: Session, book_id: int) -> None:
    pending = (
        db.query(Reservation)
        .filter(
            Reservation.book_id == book_id,
            Reservation.status == "pending",
        )
        .order_by(Reservation.reserved_at, Reservation.id)
        .all()
    )
    for position, reservation in enumerate(pending, start=1):
        reservation.queue_position = position


def promote_next_pending_reservation(db: Session, book_id: int) -> Reservation | None:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book or book.copies_available < 1:
        renumber_pending_queue(db, book_id)
        return None

    ready_count = (
        db.query(Reservation)
        .filter(
            Reservation.book_id == book_id,
            Reservation.status == "ready",
        )
        .count()
    )
    if ready_count >= book.copies_available:
        renumber_pending_queue(db, book_id)
        return None

    reservation = (
        db.query(Reservation)
        .filter(
            Reservation.book_id == book_id,
            Reservation.status == "pending",
        )
        .order_by(Reservation.reserved_at, Reservation.id)
        .first()
    )
    if not reservation:
        return None

    reservation.status = "ready"
    reservation.queue_position = None
    reservation.expires_at = _now() + timedelta(hours=PICKUP_WINDOW_HOURS)
    db.flush()
    renumber_pending_queue(db, book_id)

    book_title = book.title if book else "A reserved book"
    db.add(
        Notification(
            user_id=reservation.user_id,
            message=f'Your reservation for "{book_title}" is ready for pickup! You have {PICKUP_WINDOW_HOURS} hours to collect it.',
            type="reservation_ready",
            book_title=book_title,
            reservation_id=reservation.id,
        )
    )
    return reservation


def sync_expired_reservations(
    db: Session,
    book_id: int | None = None,
    user_id: int | None = None,
) -> int:
    q = db.query(Reservation).filter(
        Reservation.status == "ready",
        Reservation.expires_at.isnot(None),
        Reservation.expires_at <= _now(),
    )
    if book_id is not None:
        q = q.filter(Reservation.book_id == book_id)
    if user_id is not None:
        q = q.filter(Reservation.user_id == user_id)

    expired = q.all()
    if not expired:
        return 0

    affected_book_ids = {reservation.book_id for reservation in expired}
    for reservation in expired:
        reservation.status = "cancelled"
    db.flush()

    for affected_book_id in affected_book_ids:
        renumber_pending_queue(db, affected_book_id)
        promote_next_pending_reservation(db, affected_book_id)

    db.commit()
    return len(expired)
