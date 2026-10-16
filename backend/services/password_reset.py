import hmac
import re
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config import JWT_SECRET_KEY
from models.password_reset import PasswordResetCode
from models.user import User
from timezone_utils import now_ph

RESET_CODE_MINUTES = 15
RESET_CODE_LENGTH = 6


def _now() -> datetime:
    return now_ph()


def _normalize_phone(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


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

    user = (
        db.query(User).filter(User.email == value.lower()).first()
        or db.query(User).filter(User.member_id == value.upper()).first()
    )
    if user:
        return user

    phone = _normalize_phone(value)
    if not phone:
        return None

    users = db.query(User).filter(User.phone.isnot(None)).all()
    return next((u for u in users if _normalize_phone(u.phone) == phone), None)


def choose_reset_channel(user: User, requested: str | None = None) -> str | None:
    candidates = [requested] if requested else ["email", "sms"]
    for channel in candidates:
        if channel == "email" and user.email and bool(user.email_verified):
            return "email"
        if channel == "sms" and user.phone and bool(user.phone_verified):
            return "sms"
    return None


def create_password_reset_code(
    db: Session,
    user: User,
    channel: str,
) -> tuple[str, PasswordResetCode]:
    code = f"{secrets.randbelow(10 ** RESET_CODE_LENGTH):0{RESET_CODE_LENGTH}d}"
    reset = PasswordResetCode(
        user_id=user.id,
        channel=channel,
        code_hash=_hash_code(code),
        expires_at=_now() + timedelta(minutes=RESET_CODE_MINUTES),
    )
    db.add(reset)
    db.commit()
    db.refresh(reset)
    return code, reset


def verify_password_reset_code(
    db: Session,
    identifier: str,
    code: str,
) -> User:
    user = find_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code.")

    user = db.query(User).filter(User.id == user.id).with_for_update().populate_existing().one()
    reset = (
        db.query(PasswordResetCode)
        .filter(
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.code_hash == _hash_code(code.strip()),
            PasswordResetCode.used_at.is_(None),
            PasswordResetCode.expires_at > _now(),
        )
        .order_by(PasswordResetCode.created_at.desc())
        .with_for_update()
        .first()
    )
    if not reset:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code.")

    reset.used_at = _now()
    return user


def expire_unused_reset_codes_for_user(db: Session, user_id: int) -> None:
    db.query(PasswordResetCode).filter(
        PasswordResetCode.user_id == user_id,
        PasswordResetCode.used_at.is_(None),
    ).update({"used_at": _now()}, synchronize_session=False)
