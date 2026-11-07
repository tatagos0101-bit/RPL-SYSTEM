import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config import JWT_SECRET_KEY
from models.password_reset import PasswordResetCode
from models.user import User
from timezone_utils import now_ph, as_ph
from services.email_identity import find_email_user

RESET_CODE_MINUTES = 15
RESET_CODE_LENGTH = 6


def _now() -> datetime:
    return now_ph()


def _hash_code(code: str) -> str:
    return hmac.new(
        JWT_SECRET_KEY.encode("utf-8"),
        code.encode("utf-8"),
        "sha256",
    ).hexdigest()


def find_user_by_identifier(db: Session, identifier: str) -> User | None:
    value = (identifier or "").strip()
    if not value:
        return None
    if "@" in value:
        return find_email_user(db, value)

    user = (
        find_email_user(db, value)
        or db.query(User).filter(User.member_id == value.upper()).first()
    )
    if user:
        return user

    # Phone is a recovery destination, not a unique login/account identifier.
    return None


def choose_reset_channel(user: User, requested: str | None = None) -> str | None:
    candidates = [requested] if requested else ["email"]
    for channel in candidates:
        if channel == "email" and user.email and bool(user.email_verified):
            return "email"
    return None


def create_password_reset_code(
    db: Session,
    user: User,
    channel: str,
    purpose: str = "reset",
) -> tuple[str, PasswordResetCode]:
    code = f"{secrets.randbelow(10 ** RESET_CODE_LENGTH):0{RESET_CODE_LENGTH}d}"
    reset = PasswordResetCode(
        user_id=user.id,
        channel=channel,
        purpose=purpose,
        context_hash=contact_context(user, channel, purpose),
        code_hash=_hash_code(f"{user.id}:{purpose}:{channel}:{code}"),
        expires_at=_now() + timedelta(minutes=RESET_CODE_MINUTES),
    )
    db.add(reset)
    db.commit()
    db.refresh(reset)
    return code, reset


def contact_context(user, channel, purpose):
    if channel != "email":
        raise ValueError("Only email verification is supported.")
    contact = user.email.strip().lower() if user.email else ""
    return _hash_code(f"{user.id}:{purpose}:{channel}:{contact}:{user.password_hash}")


def issue_code(db, user, channel, purpose, *, test_delivery=False):
    """Serialize account sends across workers; record failed deliveries too."""
    from services import otp_delivery
    if channel != "email":
        raise HTTPException(422, "Only email verification is supported.")
    user = db.query(User).filter(User.id == user.id).with_for_update().populate_existing().one()
    if user.deleted_at is not None or user.status != "active":
        raise HTTPException(400, "Unable to send a code.")
    if purpose == "reset" and choose_reset_channel(user, channel) is None:
        raise HTTPException(400, "Unable to send a code.")
    now = _now()
    recent = db.query(PasswordResetCode).filter(
        PasswordResetCode.user_id == user.id,
        PasswordResetCode.created_at > now - timedelta(hours=1),
    ).order_by(PasswordResetCode.created_at.desc()).all()
    if len(recent) >= 5 or (recent and (now - as_ph(recent[0].created_at)).total_seconds() < 60):
        raise HTTPException(429, "Wait at least a minute before requesting another code; maximum five per hour.")
    destination = user.email
    if not destination:
        raise HTTPException(422, "Save a contact before verifying it.")
    if not test_delivery and not otp_delivery.configured(channel):
        raise HTTPException(503, "Code delivery is not configured. Contact the librarian.")
    # A replacement invalidates earlier codes of this purpose on every channel.
    db.query(PasswordResetCode).filter(
        PasswordResetCode.user_id == user.id, PasswordResetCode.purpose == purpose,
        PasswordResetCode.used_at.is_(None),
    ).update({"used_at": now}, synchronize_session=False)
    code, challenge = create_password_reset_code(db, user, channel, purpose)
    challenge_id = challenge.id
    try:
        if not test_delivery:
            otp_delivery.send_code(channel, destination, code, purpose)
    except otp_delivery.DeliveryUnavailable:
        challenge.used_at = _now()
        db.commit()
        raise HTTPException(503, "Code delivery is temporarily unavailable. Try again later or contact the librarian.") from None
    # Do not resurrect a challenge invalidated by a simultaneous password/contact change.
    challenge = db.query(PasswordResetCode).filter(PasswordResetCode.id == challenge_id).with_for_update().populate_existing().one()
    challenge.delivered_at = _now()
    db.commit()
    return code


def consume_code(db, user, code, purpose, channel=None):
    user = db.query(User).filter(User.id == user.id).with_for_update().populate_existing().one()
    invalid = HTTPException(400, "Invalid or expired code.")
    if user.deleted_at is not None or user.status != "active":
        raise invalid
    query = db.query(PasswordResetCode).filter(
        PasswordResetCode.user_id == user.id, PasswordResetCode.purpose == purpose,
        PasswordResetCode.channel == "email",
        PasswordResetCode.used_at.is_(None), PasswordResetCode.expires_at > _now(),
    )
    if channel:
        query = query.filter(PasswordResetCode.channel == channel)
    challenge = query.order_by(PasswordResetCode.id.desc()).with_for_update().first()
    if not challenge:
        raise invalid
    try:
        context_valid = challenge.context_hash == contact_context(user, challenge.channel, purpose)
    except ValueError:
        context_valid = False
    valid = (challenge.delivered_at is not None and context_valid and (challenge.attempts or 0) < 5
             and hmac.compare_digest(challenge.code_hash, _hash_code(f"{user.id}:{purpose}:{challenge.channel}:{code.strip()}")))
    if purpose == "reset" and choose_reset_channel(user, challenge.channel) is None:
        valid = False
    if not valid:
        challenge.attempts = (challenge.attempts or 0) + 1
        if challenge.attempts >= 5 or not context_valid:
            challenge.used_at = _now()
        db.commit()  # Failed attempts must survive the HTTP error/rollback.
        raise invalid
    challenge.used_at = _now()
    return user


def verify_password_reset_code(
    db: Session,
    identifier: str,
    code: str,
) -> User:
    user = find_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired code.")

    return consume_code(db, user, code, "reset")


def deliver_recovery(identifier, requested):
    """Run after the generic HTTP response; no existence-dependent SMTP latency."""
    from database import SessionLocal
    from services import otp_delivery
    from logger import security_logger
    with SessionLocal() as db:
        try:
            user = find_user_by_identifier(db, identifier)
            if not user or user.deleted_at is not None or user.status != "active":
                return
            candidates = [requested] if requested else ["email"]
            channel = next((value for value in candidates
                            if choose_reset_channel(user, value) and otp_delivery.configured(value)), None)
            if channel:
                issue_code(db, user, channel, "reset")
        except Exception:
            db.rollback()
            security_logger.warning("RECOVERY_DELIVERY_NOT_COMPLETED")


def expire_unused_reset_codes_for_user(db: Session, user_id: int) -> None:
    db.query(PasswordResetCode).filter(
        PasswordResetCode.user_id == user_id,
        PasswordResetCode.used_at.is_(None),
    ).update({"used_at": _now()}, synchronize_session=False)
