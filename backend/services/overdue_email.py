"""Librarian-requested overdue emails, using verified saved contacts only."""
from datetime import timedelta
from decimal import Decimal

from fastapi import HTTPException
from pydantic import EmailStr, TypeAdapter, ValidationError

from config import FINE_PER_DAY
from models.notification import Notification
from models.transaction import Transaction
from models.user import User
from services import otp_delivery
from services.fines import late_fee
from timezone_utils import as_ph, now_ph

REMINDER_COOLDOWN_SECONDS = 60
REMINDER_TYPES = ("overdue_email_sent", "overdue_email_unknown")
EMAIL_ADAPTER = TypeAdapter(EmailStr)


def email_reminder_unavailable(member, *, configured=None):
    if not member or member.deleted_at is not None or member.role != "member":
        return "The member account is unavailable."
    if not member.email:
        return "No email on file."
    if not member.email_verified:
        return "Ask the member to verify their saved email in Profile first."
    try:
        EMAIL_ADAPTER.validate_python(member.email)
    except ValidationError:
        return "The saved email address is invalid. Ask the member to correct and verify it."
    if not (otp_delivery.configured("email") if configured is None else configured):
        return "Library email delivery is not configured."
    return None


def overdue_duration(due, at):
    seconds = max(0, int((as_ph(at) - as_ph(due)).total_seconds()))
    days, remaining = divmod(seconds, 86400)
    hours = remaining // 3600
    parts = []
    if days:
        parts.append(f"{days} day{'s' if days != 1 else ''}")
    if hours:
        parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
    return " and ".join(parts) + " overdue" if parts else "Less than 1 hour overdue"


def date_label(value):
    return as_ph(value).strftime("%B %d, %Y at %I:%M %p PHT")


def build_overdue_email(member, loans, at):
    total = sum((late_fee(loan.due_date, at) for loan in loans), Decimal("0"))
    lines = [f"Hello {member.name},", "", "We hope you are doing well. This is a friendly reminder from Rizal Provincial Library.",
        "Our records show the following books are overdue:", ""]
    for number, loan in enumerate(loans, 1):
        lines += [f"{number}. {loan.book.title}", f"   Due: {date_label(loan.due_date)}",
            f"   How late: {overdue_duration(loan.due_date, at)}",
            f"   Current late fee: PHP {late_fee(loan.due_date, at):,.2f}", ""]
    lines += [f"Total current overdue late fees: PHP {total:,.2f}",
        f"Calculated as of {date_label(at)}.",
        f"The daily late fee is PHP {FINE_PER_DAY:,.2f} per book for each completed 24-hour day after its due time.",
        "Late fees are recalculated when a book is returned or a reported loss is recorded. These are assessments, not payment records.", "",
        "Please return the books to the library desk as soon as you can. If you have already returned them or need help with a date or fee, please contact the library desk so we can review your record.",
        "You can check your borrowed books after signing in at https://www.rizalprovinciallibrary.website/user/home", "",
        "Thank you for taking care of our shared collection.", "Rizal Provincial Library"]
    return "\n".join(lines), total


def send_overdue_reminder(db, transaction_id):
    initial = db.get(Transaction, transaction_id)
    if not initial:
        raise HTTPException(404, "Transaction not found.")
    # The same member lock used by circulation keeps this snapshot/contact stable
    # and serializes simultaneous reminder clicks, including different loan rows.
    member = db.query(User).filter(User.id == initial.user_id).populate_existing().with_for_update().first()
    reason = email_reminder_unavailable(member)
    if reason:
        raise HTTPException(422 if member and member.email else 400, reason)
    try:
        destination = str(EMAIL_ADAPTER.validate_python(member.email))
    except ValidationError:
        raise HTTPException(422, "The saved email address is invalid. Ask the member to correct and verify it.") from None
    at = now_ph()
    loans = db.query(Transaction).filter(Transaction.user_id == member.id,
        Transaction.status.in_(["active", "overdue"]), Transaction.return_date.is_(None),
        Transaction.due_date < at).order_by(Transaction.due_date, Transaction.id).populate_existing().all()
    if not any(loan.id == transaction_id for loan in loans):
        raise HTTPException(409, "This loan is no longer overdue. Refresh the Due Books page.")
    latest = db.query(Notification).filter(Notification.user_id == member.id,
        Notification.type.in_(REMINDER_TYPES),
        Notification.created_at >= at - timedelta(seconds=REMINDER_COOLDOWN_SECONDS)).order_by(Notification.created_at.desc()).first()
    if latest:
        remaining = max(1, REMINDER_COOLDOWN_SECONDS - int((as_ph(at) - as_ph(latest.created_at)).total_seconds()))
        raise HTTPException(429, "A reminder was already submitted or had an unconfirmed outcome for this member recently. Check the previous result before sending again.", headers={"Retry-After": str(remaining)})
    content, total = build_overdue_email(member, loans, at)
    result = {"status": "accepted", "overdue_books": len(loans), "total_late_fee": total, "as_of": as_ph(at)}
    try:
        otp_delivery.send_email(destination, "Rizal Provincial Library: overdue book reminder", content,
            idempotency_prefix="rpl-overdue", timeout=5, max_attempts=1)
    except otp_delivery.DeliveryUncertain:
        result["status"] = "unknown"
        result["message"] = "The email outcome could not be confirmed. Check the member's inbox or email-provider records before sending again. An in-app overdue reminder was recorded."
    except otp_delivery.DeliveryUnavailable:
        # Provider exceptions can include private addresses, credentials or content.
        # A definitive failure is retryable; uncertain sends must not be replayed.
        db.rollback()
        return {**result, "status": "failed", "message": "The email was not accepted by the email service. Please retry later or contact the system administrator."}
    except Exception:
        result["status"] = "unknown"
        result["message"] = "The email outcome could not be confirmed. Check the member's inbox or email-provider records before sending again. An in-app overdue reminder was recorded."
    else:
        result["message"] = f"Overdue email submitted for {len(loans)} book{'s' if len(loans) != 1 else ''}. Current late fees: PHP {total:,.2f}. The member can check their inbox or spam folder; inbox delivery is not guaranteed."
    notification = Notification(user_id=member.id,
        created_at=at,
        type="overdue_email_sent" if result["status"] == "accepted" else "overdue_email_unknown",
        member_name=member.name,
        message=f"Library reminder: {len(loans)} overdue book{'s' if len(loans) != 1 else ''}. Current overdue late fees: PHP {total:,.2f}, calculated {date_label(at)}. Please review your borrowed books or contact the library desk.")
    db.add(notification)
    try:
        db.commit()
    except Exception:
        db.rollback()
        # The external send may already be accepted. Never label this as failed or
        # retry the email automatically when its local receipt could not be saved.
        return {**result, "status": "unknown", "message": "The email may have been submitted, but its reminder record could not be saved. Check the member's inbox or provider records before sending again."}
    return result
