from datetime import datetime

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File, Form
from pydantic import BaseModel, ConfigDict
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, get_session_user, get_locked_current_user, get_locked_session_user
from services.member_deletion import lock_active_account
from services.auth_cookie import set_auth_cookie
from services.auth_sessions import create_session_token, revoke_user_sessions
from services.password_reset import expire_unused_reset_codes_for_user
from models.notification import Notification
from models.face_embedding import FaceEmbedding
from models.user import User
from schemas.user import UserProfile, UserProfileUpdate, BiometricStatus, ChangePasswordRequest, ChangePasswordResponse
from services.upload_validation import IMAGE_EXTS, validate_upload_bytes
from services.storage_service import save_upload, resolve_upload_url, delete_upload
from services.cloud_uploads import read_upload
from logger import get_logger

logger = get_logger("users")

router = APIRouter(prefix="/api/user", tags=["User"])


def _face_enrolled(db: Session, user: User) -> bool:
    if user.face_encoding:
        return True
    return (
        db.query(FaceEmbedding.id)
        .filter(FaceEmbedding.user_id == user.id, FaceEmbedding.is_active == True)
        .first()
        is not None
    )


def _build_profile(user: User, db: Session) -> UserProfile:
    return UserProfile(
        id=user.id,
        name=user.name,
        email=user.email,
        email_verified=bool(user.email_verified),
        role=user.role,
        phone=user.phone,
        phone_verified=bool(user.phone_verified),
        location=user.location,
        status=user.status,
        must_change_password=bool(user.must_change_password),
        face_enrolled=_face_enrolled(db, user),
        member_since=user.created_at,
        member_id=user.member_id or f"RPL-{user.id:05d}",
        avatar_url=resolve_upload_url(user.avatar_url),
    )


@router.get("/profile", response_model=UserProfile)
def get_profile(current_user: User = Depends(get_session_user), db: Session = Depends(get_db)):
    return _build_profile(current_user, db)


@router.put("/profile", response_model=UserProfile)
def update_profile(
    body: UserProfileUpdate,
    current_user: User = Depends(get_locked_current_user),
    db: Session = Depends(get_db),
):
    current_user = lock_active_account(db, current_user.id)
    if body.name is not None:
        current_user.name = body.name
    if "phone" in body.model_fields_set:
        if body.phone != current_user.phone:
            current_user.phone_verified = False
        current_user.phone = body.phone
    if "location" in body.model_fields_set:
        current_user.location = body.location
    db.commit()
    db.refresh(current_user)
    return _build_profile(current_user, db)


@router.put("/change-password", response_model=ChangePasswordResponse)
def change_password(
    body: ChangePasswordRequest,
    response: Response,
    current_user: User = Depends(get_locked_session_user),
    db: Session = Depends(get_db),
):
    from services.passwords import hash_password, verify_password

    current_user = lock_active_account(db, current_user.id)
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    revoke_user_sessions(db, current_user.id)
    expire_unused_reset_codes_for_user(db, current_user.id)
    token = create_session_token(db, current_user)
    db.commit()
    set_auth_cookie(response, token)
    # Confirm the committed first-login state without a second profile request
    # (which also signs avatar links and can fail independently of this save).
    return ChangePasswordResponse(
        success=True, message="Password updated successfully.",
        id=current_user.id, name=current_user.name, role=current_user.role,
        must_change_password=bool(current_user.must_change_password),
    )


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile | None = File(None),
    upload_ticket: str | None = Form(None),
    current_user: User = Depends(get_locked_current_user),
    db: Session = Depends(get_db),
):
    content, original_filename, reference = await read_upload(folder="avatars", user_id=current_user.id, file=file, ticket=upload_ticket)
    ext = validate_upload_bytes(
        content=content,
        filename=original_filename,
        allowed_exts=IMAGE_EXTS,
        max_bytes=5 * 1024 * 1024,
        human_label="Avatar",
    )

    current_user = lock_active_account(db, current_user.id)
    old_avatar = current_user.avatar_url
    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}{ext}"
    current_user.avatar_url = reference or save_upload("avatars", filename, content)
    db.commit()
    # Keep the previous avatar until the new reference is committed successfully.
    try:
        if old_avatar != current_user.avatar_url:
            delete_upload(old_avatar, folder="avatars")
    except HTTPException:
        logger.warning("Could not delete previous avatar for user_id=%s", current_user.id)
    return {"avatar_url": resolve_upload_url(current_user.avatar_url)}


@router.get("/biometric-status", response_model=BiometricStatus)
def biometric_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    enrolled = _face_enrolled(db, current_user)
    return BiometricStatus(
        enrolled=enrolled,
        message="Face ID enrolled" if enrolled else "Face ID not enrolled",
    )


# ── User Notifications ────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: int
    message: str
    type: str
    book_title: str | None = None
    is_read: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


@router.get("/notifications", response_model=list[NotificationOut])
def get_notifications(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    return (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(desc(Notification.created_at))
        .limit(30)
        .all()
    )


@router.post("/notifications/read-all", status_code=204)
def mark_all_read(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()


@router.post("/notifications/{notif_id}/read", status_code=204)
def mark_notification_read(
    notif_id:     int,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    notif = db.query(Notification).filter(
        Notification.id      == notif_id,
        Notification.user_id == current_user.id,
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
