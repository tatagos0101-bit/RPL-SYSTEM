from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.transaction import Transaction
from timezone_utils import now_ph

OVERDUE_BORROW_BLOCK_MESSAGE = "Member has overdue books. Return overdue books before borrowing new ones."


def _now() -> datetime:
    return now_ph()


def sync_overdue_loans(db: Session, user_id: int | None = None, *, commit: bool = True) -> int:
    """Persist active loans whose due date has passed as overdue."""
    q = db.query(Transaction).filter(
        Transaction.status == "active",
        Transaction.due_date.isnot(None),
        Transaction.due_date <= _now(),
    )
    if user_id is not None:
        q = q.filter(Transaction.user_id == user_id)

    changed = q.update({Transaction.status: "overdue"}, synchronize_session=False)
    if changed and commit:
        db.commit()
    return changed


def member_has_overdue(db: Session, user_id: int, *, commit: bool = True) -> bool:
    sync_overdue_loans(db, user_id=user_id, commit=commit)
    return (
        db.query(Transaction.id)
        .filter(Transaction.user_id == user_id, Transaction.status == "overdue")
        .first()
        is not None
    )


def assert_can_borrow(db: Session, user_id: int, *, commit: bool = True) -> None:
    if member_has_overdue(db, user_id, commit=commit):
        raise HTTPException(status_code=409, detail=OVERDUE_BORROW_BLOCK_MESSAGE)
