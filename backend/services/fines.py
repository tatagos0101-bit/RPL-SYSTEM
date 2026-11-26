"""Current late-fee assessments. Reads never change loans or record payments."""
from decimal import Decimal

from config import FINE_PER_DAY
from models.transaction import Transaction
from timezone_utils import as_ph, now_ph


def late_fee(due_date, at=None):
    if due_date is None:
        return Decimal("0")
    days = max(0, (as_ph(at or now_ph()) - as_ph(due_date)).days)
    return Decimal(days) * Decimal(FINE_PER_DAY)


def current_fines(db, member_ids=None, at=None):
    at = at or now_ph()
    query = db.query(Transaction.user_id, Transaction.due_date).filter(
        Transaction.return_date.is_(None),
        Transaction.status.in_(["active", "overdue"]),
        Transaction.due_date < at,
    )
    if member_ids is not None:
        query = query.filter(Transaction.user_id.in_(member_ids))
    amounts = {}
    loans = 0
    for user_id, due in query:
        loans += 1
        amounts[user_id] = amounts.get(user_id, Decimal("0")) + late_fee(due, at)
    return {"by_member": amounts, "total": sum(amounts.values(), Decimal("0")),
        "overdue_loans": loans, "members_with_fines": sum(value > 0 for value in amounts.values()),
        "daily_rate": FINE_PER_DAY, "as_of": as_ph(at)}
