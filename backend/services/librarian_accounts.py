"""An explicitly designated librarian manages staff; no implicit first-user grant."""
import secrets
import string

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_locked_current_user
from models.library_settings import LibrarySetting
from models.user import User

MANAGER_SETTING_KEY = "librarian_account_manager_id"


def can_manage_librarians(db: Session, user: User) -> bool:
    if (user.role != "librarian" or user.status != "active"
            or user.deleted_at is not None or user.must_change_password):
        return False
    setting = db.get(LibrarySetting, MANAGER_SETTING_KEY)
    return setting is not None and setting.value == str(user.id)


def require_librarian_account_manager(
    db: Session = Depends(get_db),
    user: User = Depends(get_locked_current_user),
) -> User:
    # Keep designation stable until this request's transaction ends.
    db.query(LibrarySetting).filter_by(key=MANAGER_SETTING_KEY).with_for_update(
        read=True).populate_existing().first()
    if not can_manage_librarians(db, user):
        raise HTTPException(403, "Only the main librarian can manage librarian accounts.")
    return user


def designate_librarian_manager(db: Session, user_id: int) -> None:
    """Operator-only setup, never exposed as a public/account registration endpoint."""
    user = db.get(User, user_id)
    if (user is None or user.role != "librarian" or user.status != "active"
            or user.deleted_at is not None or user.must_change_password):
        raise ValueError("Choose an active librarian with a completed password change.")
    db.merge(LibrarySetting(key=MANAGER_SETTING_KEY, value=str(user.id)))


def temporary_staff_password() -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(14))
        if any(c.islower() for c in password) and any(c.isupper() for c in password) and any(c.isdigit() for c in password):
            return password


def new_staff_member_id(db: Session) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        identifier = "RPL-" + "".join(secrets.choice(alphabet) for _ in range(5))
        if db.query(User.id).filter_by(member_id=identifier).first() is None:
            return identifier
