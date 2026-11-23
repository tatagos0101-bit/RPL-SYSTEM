"""Server-enforced lifetime for librarian-issued temporary passwords."""
from datetime import timedelta
from fastapi import HTTPException
from timezone_utils import as_ph, now_ph

TEMPORARY_PASSWORD_HOURS = 24


def temporary_password_deadline():
    return now_ph() + timedelta(hours=TEMPORARY_PASSWORD_HOURS)


def require_current_temporary_password(user):
    deadline = user.temporary_password_expires_at
    if deadline is not None and as_ph(deadline) <= now_ph():
        raise HTTPException(403, "Temporary password expired. Ask the librarian for a new temporary password.")
