from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from config import PICKUP_WINDOW_HOURS
from models.book import Book
from models.notification import Notification
from models.reservation import Reservation
from models.user import User
from services.borrowing_capacity import lock_books, free_title_capacity
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

    pending = (db.query(Reservation).join(User).filter(
        Reservation.book_id == book_id, Reservation.status == "pending", User.status == "active"
    ).order_by(Reservation.reserved_at, Reservation.id).limit(free_title_capacity(db, book)).all())
    for reservation in pending:
        reservation.status = "ready"
        reservation.queue_position = None
        reservation.expires_at = _now() + timedelta(hours=PICKUP_WINDOW_HOURS)
        db.add(Notification(user_id=reservation.user_id,
            message=f'Your reservation for "{book.title}" is ready for pickup! You have {PICKUP_WINDOW_HOURS} hours to collect it.',
            type="reservation_ready", book_title=book.title, reservation_id=reservation.id))
    db.flush()
    renumber_pending_queue(db, book_id)
    return pending[0] if pending else None


def sync_expired_reservations(
    db: Session,
    book_id: int | None = None,
    user_id: int | None = None,
    *,
    commit: bool = True,
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

    # Book locks serialize expiry/promotion with confirmation and circulation.
    # These transitions never add a member commitment, so no second member lock
    # is acquired while holding a book lock.
    book_ids = {row[0] for row in q.with_entities(Reservation.book_id).all()}
    if book_id is not None:
        book_ids.add(book_id)
    elif user_id is not None:
        book_ids.update(row[0] for row in db.query(Reservation.book_id).filter(
            Reservation.user_id == user_id, Reservation.status.in_(["pending", "ready"])).all())
    books = lock_books(db, book_ids)
    # Re-query after waiting for a concurrent transaction's lock.
    expired = db.query(Reservation).filter(Reservation.book_id.in_(book_ids),
        Reservation.status == 'ready', Reservation.expires_at.isnot(None),
        Reservation.expires_at <= _now()).populate_existing().all()
    for reservation in expired:
        reservation.status = "cancelled"
    db.flush()
    for affected_book_id in sorted(books):
        promote_next_pending_reservation(db, affected_book_id)
    if commit:
        db.commit()
    return len(expired)
