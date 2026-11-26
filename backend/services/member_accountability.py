from decimal import Decimal

from sqlalchemy import or_

from models.member_account_action import MemberAccountAction
from models.notification import Notification
from models.transaction import Transaction
from services.auth_sessions import revoke_user_sessions
from services.fines import current_fines, late_fee
from timezone_utils import as_ph, now_ph


def apply_account_action(db, member, actor, body):
    """Caller owns member lock and commit; no automatic suspension thresholds."""
    if body.action == "blacklist":
        member.is_blacklisted = True
        member.status = "suspended"
    elif body.action == "suspend":
        member.status = "suspended"
    elif body.action == "reactivate":
        member.is_blacklisted = False
        member.status = "active"
    if member.status != "active":
        revoke_user_sessions(db, member.id)
    db.add(MemberAccountAction(user_id=member.id, actor_id=actor.id, action=body.action,
        reason=body.reason, notes=(body.notes or "").strip() or None))
    messages = {"warning": "Please contact the library desk to review your borrowing record.",
        "suspend": "Your borrowing account has been suspended following librarian review. Please contact the library desk for assistance.",
        "blacklist": "Your borrowing account has been blocked following librarian review. Please contact the library desk to discuss the record.",
        "reactivate": "Your account has been reactivated following librarian review. Thank you for coordinating with the library."}
    db.add(Notification(user_id=member.id, type="account_review", message=messages[body.action]))


def accountability(db, member, skip=0, limit=25):
    now = now_ph()
    overdue_filter = (Transaction.return_date.is_(None) & Transaction.status.in_(["active", "overdue"]) & (Transaction.due_date <= now))
    issues = db.query(Transaction).filter(Transaction.user_id == member.id, or_(
        overdue_filter, Transaction.return_condition.in_(["damaged", "lost"]),
        Transaction.return_date > Transaction.due_date, Transaction.fine_amount > 0))
    overdue_count = db.query(Transaction).filter(Transaction.user_id == member.id, overdue_filter).count()
    records = []
    for loan in issues.order_by(Transaction.borrow_date.desc(), Transaction.id.desc()).offset(skip).limit(limit).all():
        records.append({"transaction_id": loan.id, "title": loan.book.title,
            "copy_qr": loan.copy.qr_code if loan.copy else None,
            "borrow_date": as_ph(loan.borrow_date), "due_date": as_ph(loan.due_date) if loan.due_date else None,
            "return_date": as_ph(loan.return_date) if loan.return_date else None,
            "condition": loan.return_condition, "remark": loan.inspection_reason,
            "notes": loan.inspection_notes,
            "is_outstanding": loan.return_date is None and loan.status in ("active", "overdue"),
            "current_late_fee": late_fee(loan.due_date, now) if loan.return_date is None and loan.status in ("active", "overdue") else Decimal("0"),
            "assessed_charges": loan.fine_amount or Decimal("0"),
            "inspected_by_id": loan.inspected_by_id, "inspected_at": loan.inspected_at})
    actions = db.query(MemberAccountAction).filter_by(user_id=member.id)
    return {"status": member.status, "is_blacklisted": bool(member.is_blacklisted),
        "current_overdue_fine": current_fines(db, [member.id], now)["total"],
        "current_overdue": overdue_count, "total": issues.count(), "skip": skip, "limit": limit,
        "records": records, "actions_total": actions.count(), "actions": [
            {"id": item.id, "action": item.action, "reason": item.reason, "notes": item.notes,
             "actor_id": item.actor_id, "created_at": as_ph(item.created_at)}
            for item in actions.order_by(MemberAccountAction.id.desc()).limit(25).all()],
        "note": "Charges are assessed amounts, not payment records. Restrictions require librarian review."}
