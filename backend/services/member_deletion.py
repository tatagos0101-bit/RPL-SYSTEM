"""Explicit librarian deletion policy. Callers own the database transaction."""
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import or_

from models.auth_session import AuthSession
from models.book_interaction import BookInteraction
from models.entry_log import EntryLog
from models.face_embedding import FaceEmbedding
from models.inventory_write import InventoryWrite
from models.notification import Notification
from models.password_reset import PasswordResetCode
from models.reading_goal import ReadingGoal
from models.reservation import Reservation, ReservationConfirmation
from models.security_alert import SecurityAlert
from models.transaction import Transaction
from models.user import User
from services import storage_service
from services.borrowing_capacity import lock_member, lock_books
from services.reservation_policy import sync_expired_reservations
from timezone_utils import now_ph


def lock_existing_member(db, user_id, *, allow_deleted=False):
    member = lock_member(db, user_id)
    if member.role != "member" or (member.deleted_at is not None and not allow_deleted):
        raise HTTPException(404, "Member not found.")
    return member


def lock_active_account(db, user_id):
    """Recheck after waiting for deletion/suspension, before writing identity data."""
    user = lock_member(db, user_id)
    if user.deleted_at is not None or user.status != "active":
        raise HTTPException(401, "Account is no longer active. Please sign in again.")
    return user


def delete_face_data(db, member):
    # Include inactive/legacy templates: disabling only the current template
    # would leave old biometric material behind.
    member.face_encoding = None
    db.query(FaceEmbedding).filter(FaceEmbedding.user_id == member.id).delete(synchronize_session=False)
    db.query(SecurityAlert).filter(SecurityAlert.user_id == member.id).update(
        {SecurityAlert.snapshot_b64: None}, synchronize_session=False)
    db.query(AuthSession).filter(AuthSession.user_id == member.id).delete(synchronize_session=False)


def _validate_private_reference(reference, folder):
    if not reference:
        return
    parsed = urlsplit(reference)
    if parsed.scheme == "supabase" and parsed.netloc == storage_service.BUCKETS[folder] and parsed.path.strip("/"):
        return
    prefix = f"/uploads/{folder}/"
    filename = reference.removeprefix(prefix)
    if (storage_service.STORAGE_BACKEND == "local" and reference.startswith(prefix)
            and filename and filename == Path(filename).name and "/" not in filename and "\\" not in filename):
        return
    raise HTTPException(409, "A legacy private upload needs storage review before this account can be deleted.")


def delete_account(db, member):
    if member.deleted_at is not None:
        return  # A repeated confirmed request cannot damage retained history.
    if db.query(Transaction.id).filter(
        Transaction.user_id == member.id,
        or_(Transaction.status.in_(["active", "overdue"]),
            Transaction.type == "borrow", Transaction.return_date.is_(None)),
    ).first():
        raise HTTPException(409, "Return all outstanding books before deleting this account.")

    # Legacy loan-report notices have only a name, not a subject foreign key.
    legacy_notices = db.query(Notification).filter(
        Notification.user_id.is_(None), Notification.reservation_id.is_(None),
        Notification.member_name == member.name)
    if legacy_notices.first() and db.query(User.id).filter(
        User.id != member.id, User.name == member.name, User.deleted_at.is_(None),
    ).first():
        raise HTTPException(409, "Older notices share this member's name. Review their ownership before deleting the account.")

    references = [(member.avatar_url, "avatars"), (member.id_image_url, "ids")]
    for reference, folder in references:
        _validate_private_reference(reference, folder)
        if reference and db.query(User.id).filter(
            User.id != member.id,
            or_(User.avatar_url == reference, User.id_image_url == reference),
        ).first():
            raise HTTPException(409, "A private upload is shared with another account. Review its ownership before deletion.")

    reservations = db.query(Reservation).filter(Reservation.user_id == member.id).all()
    book_ids = sorted({row.book_id for row in reservations if row.status in ("pending", "ready")})
    lock_books(db, book_ids)
    # Storage cannot join a SQL transaction. Delete first and keep references on
    # failure so retries can finish; never report success with files left behind.
    try:
        for reference, folder in references:
            storage_service.delete_upload(reference, folder=folder)
    except (HTTPException, OSError):
        raise HTTPException(502, "Private-file deletion could not be completed. Some files may already be removed. Retry account deletion.") from None

    for reservation in reservations:
        db.refresh(reservation)
        if reservation.status in ("pending", "ready"):
            reservation.status = "cancelled"
            reservation.queue_position = None
    db.flush()
    for book_id in book_ids:
        sync_expired_reservations(db, book_id=book_id, commit=False)

    legacy_notices.delete(synchronize_session=False)
    reservation_ids = db.query(Reservation.id).filter(Reservation.user_id == member.id)
    db.query(Notification).filter(or_(
        Notification.user_id == member.id, Notification.reservation_id.in_(reservation_ids),
    )).delete(synchronize_session=False)
    for model in (PasswordResetCode, ReadingGoal, BookInteraction, ReservationConfirmation, InventoryWrite):
        db.query(model).filter(model.user_id == member.id).delete(synchronize_session=False)
    delete_face_data(db, member)
    db.query(SecurityAlert).filter(SecurityAlert.user_id == member.id).update(
        {SecurityAlert.user_id: None, SecurityAlert.ip_address: None}, synchronize_session=False)
    db.query(EntryLog).filter(EntryLog.user_id == member.id).update(
        {EntryLog.note: None}, synchronize_session=False)
    member.name = "Deleted member"
    member.member_id = None
    member.email = member.phone = member.location = None
    member.id_image_url = member.avatar_url = None
    member.email_verified = member.phone_verified = member.must_change_password = False
    member.password_hash = "!deleted"
    member.status = "suspended"
    member.deleted_at = now_ph()
