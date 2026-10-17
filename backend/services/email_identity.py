"""Case-insensitive lookup without choosing between conflicting identities."""
from sqlalchemy import func
from models.user import User


def normalize_email(value):
    return value.strip().lower() if value else None


def email_matches(db, value):
    return db.query(User).filter(func.lower(func.trim(User.email)) == normalize_email(value)).limit(2).all()


def find_email_user(db, value):
    matches = email_matches(db, value)
    return matches[0] if len(matches) == 1 else None
