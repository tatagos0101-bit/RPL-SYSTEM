from fastapi import HTTPException

from models.user import User
from timezone_utils import now_ph


FACE_CONSENT_VERSION = "2026-11-26"


def require_enrollment_consent(accepted: bool, notice_version: str | None) -> None:
    if not accepted:
        raise HTTPException(422, "The account holder must agree to facial recognition before enrollment.")
    if notice_version != FACE_CONSENT_VERSION:
        raise HTTPException(422, "Reload the page to review and agree to the current facial recognition notice.")


def record_enrollment_consent(user: User, *, librarian: User | None = None) -> None:
    user.face_consent_version = FACE_CONSENT_VERSION
    user.face_consent_at = now_ph()
    user.face_consent_method = "self" if librarian is None else "librarian_assisted"
    user.face_consent_recorded_by_id = user.id if librarian is None else librarian.id
