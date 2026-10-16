from datetime import datetime, timedelta
from time import time

from timezone_utils import now_ph
from typing import Optional
import random
import string
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from config import LIBRARIAN_AUTH_CODE, ENVIRONMENT
from database import get_db
from dependencies import get_current_user, require_librarian, oauth2_scheme
from limiter import limiter
from logger import security_logger
from middleware.security import _client_ip
from models.user import User
from models.entry_log import EntryLog
from services.auth_cookie import AUTH_COOKIE_NAME, clear_auth_cookie, set_auth_cookie
from services.auth_sessions import create_session_token, revoke_token_session, revoke_user_sessions
from services.password_reset import (
    RESET_CODE_MINUTES,
    choose_reset_channel,
    create_password_reset_code,
    find_user_by_identifier,
    verify_password_reset_code,
    expire_unused_reset_codes_for_user,
)
from schemas.auth import (
    LoginRequest, SignupRequest, TokenResponse,
    PasswordResetRequest, PasswordResetRequestResponse,
    PasswordResetConfirmRequest, PasswordResetConfirmResponse,
    FaceAuthRequest, FaceAuthResponse,
    FaceLookupResponse, EnrollFaceRequest,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _hash(password: str) -> str:
    return pwd_ctx.hash(password)

def _verify(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)

def _make_token(user_id: int, db: Session | None = None) -> str:
    # Compatibility for local test helpers; request handlers pass their session
    # and commit explicitly before returning a token or cookie.
    if db is None:
        from database import SessionLocal
        with SessionLocal() as owned_db:
            token = _make_token(user_id, owned_db)
            owned_db.commit()
            return token
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return create_session_token(db, user)

_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L

def _generate_member_id(db) -> str:
    """Generate a unique random Member ID like RPL-K7X2M."""
    while True:
        mid = "RPL-" + "".join(random.choices(_ID_CHARS, k=5))
        if not db.query(User).filter(User.member_id == mid).first():
            return mid


# ── Email / Password Login ────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
@limiter.limit("7/minute")
def login(request: Request, response: Response, body: LoginRequest, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    identifier = body.email.strip()
    user = (
        db.query(User).filter(User.email == identifier.lower()).first()
        or db.query(User).filter(User.member_id == identifier.upper()).first()
    )
    if not user or not _verify(body.password, user.password_hash):
        security_logger.warning("LOGIN_FAILED ip=%s", ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email/Member ID or password")
    if user.status == "suspended":
        security_logger.warning("LOGIN_SUSPENDED ip=%s user_id=%d", ip, user.id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended. Contact librarian.")
    security_logger.info("LOGIN_SUCCESS ip=%s user_id=%d role=%s", ip, user.id, user.role)
    token = _make_token(user.id, db)
    db.commit()
    set_auth_cookie(response, token)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        role=user.role,
        must_change_password=bool(user.must_change_password),
    )


# ── Sign Up ───────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def signup(request: Request, response: Response, body: SignupRequest, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    if body.role == "librarian":
        if not LIBRARIAN_AUTH_CODE or not secrets.compare_digest((body.auth_code or "").encode(), LIBRARIAN_AUTH_CODE.encode()):
            security_logger.warning("SIGNUP_BAD_LIBCODE ip=%s", ip)
            raise HTTPException(status_code=403, detail="Invalid librarian authorization code")

    if db.query(User).filter(User.email == body.email).first():
        security_logger.info("SIGNUP_DUPLICATE ip=%s", ip)
        raise HTTPException(status_code=400, detail="Unable to register. Contact the librarian for assistance.")

    user = User(
        name=body.name,
        email=body.email,
        password_hash=_hash(body.password),
        role=body.role,
        phone=body.phone,
        email_verified=False,
        phone_verified=False,
        location=body.location,
        member_id=_generate_member_id(db),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    security_logger.info("SIGNUP_SUCCESS ip=%s user_id=%d role=%s", ip, user.id, user.role)
    token = _make_token(user.id, db)
    db.commit()
    set_auth_cookie(response, token)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        role=user.role,
        must_change_password=bool(user.must_change_password),
    )


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
@limiter.limit("5/minute")
def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    if ENVIRONMENT != "test":
        # Delivery is not configured yet. Give every identifier the same response;
        # never disclose account existence, recovery contacts, or reset codes.
        return PasswordResetRequestResponse(
            success=True,
            message="Please visit the librarian to reset your password.",
            requires_librarian_help=True,
        )
    user = find_user_by_identifier(db, body.identifier)
    if not user:
        return PasswordResetRequestResponse(
            success=True,
            message="If the account has a verified recovery contact, a reset code was prepared.",
        )

    channel = choose_reset_channel(user, body.channel)
    if not channel:
        return PasswordResetRequestResponse(
            success=False,
            message="No verified email or phone is available. Please visit the librarian for password reset.",
            requires_librarian_help=True,
        )

    code, _ = create_password_reset_code(db, user, channel)
    response_body = PasswordResetRequestResponse(
        success=True,
        message=f"Reset code prepared for {channel}. It expires in {RESET_CODE_MINUTES} minutes.",
        delivery_channel=channel,
    )
    if ENVIRONMENT == "test":
        response_body.debug_code = code
    return response_body


@router.post("/password-reset/confirm", response_model=PasswordResetConfirmResponse)
@limiter.limit("10/minute")
def confirm_password_reset(
    request: Request,
    body: PasswordResetConfirmRequest,
    db: Session = Depends(get_db),
):
    user = verify_password_reset_code(db, body.identifier, body.code)
    user.password_hash = _hash(body.new_password)
    user.must_change_password = False
    revoke_user_sessions(db, user.id)
    expire_unused_reset_codes_for_user(db, user.id)
    db.commit()
    return PasswordResetConfirmResponse(success=True, message="Password has been reset.")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response,
           token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # Idempotent, including expired/missing cookies and suspended accounts.
    for credential in {token, request.cookies.get(AUTH_COOKIE_NAME)}:
        revoke_token_session(db, credential)
    db.commit()
    clear_auth_cookie(response)


# ── Face Recognition — Entry Gate (logs entry, optionally issues token) ───────

# How long a gap (in minutes) before a new time-in session begins for the same person
SESSION_TIMEOUT_MINUTES = 5
LEAVE_TIMEOUT_SECONDS = 60
MIN_TOGGLE_SECONDS = 10
SESSION_WINDOW_MINUTES = 30
_last_seen_by_ip: dict[str, dict] = {}

def _close_idle_session(ip: str, db: Session) -> None:
    state = _last_seen_by_ip.get(ip)
    if not state:
        return
    if time() - state["ts"] < LEAVE_TIMEOUT_SECONDS:
        return

    now = now_ph().replace(tzinfo=None)
    session_cutoff = now - timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    existing = (
        db.query(EntryLog)
        .filter(
            EntryLog.user_id == state["user_id"],
            EntryLog.granted == True,
            or_(
                EntryLog.time_out >= session_cutoff,
                and_(EntryLog.time_out.is_(None), EntryLog.accessed_at >= session_cutoff),
            ),
        )
        .order_by(EntryLog.accessed_at.desc())
        .first()
    )
    if existing:
        existing.time_out = now
        db.commit()

    _last_seen_by_ip.pop(ip, None)


@router.post("/face", response_model=FaceAuthResponse)
@limiter.limit("120/minute")
def face_auth(request: Request, response: Response, body: FaceAuthRequest, db: Session = Depends(get_db)):
    return process_entry_face(request, response, body.image, db, issue_token=True)


def _legacy_process_entry_face(
    request: Request,
    response: Optional[Response],
    image: str,
    db: Session,
    issue_token: bool = True,
) -> FaceAuthResponse:
    """
    Called by EntryGate every ~900ms.
    Identifies the person → upserts session log (time_in / time_out) → returns match info.
    """
    import services.face_engine_service as face_engine_service
    from services.liveness_service import check_liveness
    from models.security_alert import SecurityAlert
    from sqlalchemy import desc as _desc, func, text

    ip = _client_ip(request)

    # ── Liveness check ────────────────────────────────────────────────────────
    hint, real_prob = check_liveness(image)
    if hint == "too_dark":
        _close_idle_session(ip, db)
        return FaceAuthResponse(matched=False, message="too_dark")
    if hint == "too_far":
        _close_idle_session(ip, db)
        return FaceAuthResponse(matched=False, message="too_far")
    if hint == "retry":
        _close_idle_session(ip, db)
        return FaceAuthResponse(matched=False, message="no_face")
    if hint == "spoof":
        security_logger.warning("SPOOF_ENTRY_DETECTED ip=%s prob=%.3f", ip, real_prob)
        
        # Log alert to DB (rate limited to 1 per minute)
        from datetime import timezone as _timezone
        utc_now = datetime.now(_timezone.utc)
        minute_ago = utc_now - timedelta(minutes=1)
        
        recent_alert = db.query(SecurityAlert).filter(
            SecurityAlert.ip_address == ip,
            SecurityAlert.created_at >= minute_ago
        ).first()

        if not recent_alert:
            db.add(SecurityAlert(
                alert_type="SPOOF_ENTRY",
                user_id=None,
                ip_address=ip,
                snapshot_b64=image if image.startswith("data:") else f"data:image/jpeg;base64,{image}",
            ))
            db.commit()
            
        return FaceAuthResponse(matched=False, message="Spoofing Detected")
    # hint == "ok" → proceed

    try:
        live_encoding = encode_face(image)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="Face recognition is temporarily unavailable.") from None

    if live_encoding is None:
        _close_idle_session(ip, db)
        return FaceAuthResponse(matched=False, message="no_face")

    now = now_ph().replace(tzinfo=None)
    session_cutoff = now - timedelta(minutes=SESSION_TIMEOUT_MINUTES)

    enrolled_users = db.query(User).filter(User.face_encoding.isnot(None)).all()
    matched_user = find_match(live_encoding, enrolled_users)

    if matched_user is None or matched_user.status == "suspended":
        security_logger.info("FACE_UNRECOGNIZED entry_gate")
        unknown_cutoff = now - timedelta(minutes=1)
        existing = (
            db.query(EntryLog)
            .filter(
                EntryLog.user_id.is_(None),
                EntryLog.granted == False,
                or_(
                    EntryLog.time_out >= unknown_cutoff,
                    and_(EntryLog.time_out.is_(None), EntryLog.accessed_at >= unknown_cutoff),
                ),
            )
            .order_by(_desc(EntryLog.accessed_at))
            .first()
        )
        if existing:
            existing.time_out = now
        else:
            db.add(EntryLog(
                user_id=None, entry_type="face_scan",
                granted=False, note="Unknown visitor",
            ))
        db.commit()
        return FaceAuthResponse(matched=False, message="not_recognized")

    # Recognized — toggle in/out within a session window
    latest = (
        db.query(EntryLog)
        .filter(EntryLog.user_id == matched_user.id, EntryLog.granted == True)
        .order_by(_desc(EntryLog.accessed_at))
        .first()
    )

    if latest:
        in_age_seconds = (now - latest.accessed_at).total_seconds()
        if in_age_seconds <= SESSION_WINDOW_MINUTES * 60:
            if in_age_seconds >= MIN_TOGGLE_SECONDS:
                latest.time_out = now
        else:
            db.add(EntryLog(
                user_id=matched_user.id, entry_type="face_scan",
                granted=True, note=matched_user.name,
                accessed_at=now,
            ))
    else:
        db.add(EntryLog(
            user_id=matched_user.id, entry_type="face_scan",
            granted=True, note=matched_user.name,
            accessed_at=now,
        ))
    db.commit()

    _last_seen_by_ip[ip] = {"user_id": matched_user.id, "ts": time()}

    security_logger.info("FACE_ENTRY_SUCCESS user_id=%d", matched_user.id)
    token = _make_token(matched_user.id, db) if issue_token else None
    if issue_token:
        db.commit()
    if issue_token and response is not None and token:
        set_auth_cookie(response, token)
    return FaceAuthResponse(
        matched=True,
        user_id=matched_user.id,
        name=matched_user.name,
        role=matched_user.role,
        token=token,
        message="recognized",
    )


# ── Face Lookup — Borrow/Return Modal (librarian-only, no entry log, no token) ─

def process_entry_face(
    request: Request,
    response: Optional[Response],
    image: str,
    db: Session,
    issue_token: bool = True,
) -> FaceAuthResponse:
    """
    Entrance-station face processing.

    Kiosk scans may include multiple faces. Login scans remain strict and
    reject frames with more than one face.
    """
    from config import ENTRY_MAX_FACES_PER_FRAME
    from models.security_alert import SecurityAlert
    from services.entry_session_policy import record_entry_scan
    import services.face_engine_service as face_engine_service
    from services.liveness_service import check_liveness
    from sqlalchemy import desc as _desc

    ip = _client_ip(request)

    hint, real_prob = check_liveness(image)
    if hint == "too_dark":
        return FaceAuthResponse(matched=False, message="too_dark")
    if hint == "too_far" and issue_token:
        return FaceAuthResponse(matched=False, message="too_far")
    if hint == "retry":
        return FaceAuthResponse(matched=False, message="no_face")
    if hint == "spoof":
        security_logger.warning("SPOOF_ENTRY_DETECTED ip=%s prob=%.3f", ip, real_prob)

        from datetime import timezone as _timezone
        utc_now = datetime.now(_timezone.utc)
        minute_ago = utc_now - timedelta(minutes=1)
        recent_alert = db.query(SecurityAlert).filter(
            SecurityAlert.ip_address == ip,
            SecurityAlert.created_at >= minute_ago,
        ).first()

        if not recent_alert:
            db.add(SecurityAlert(
                alert_type="SPOOF_ENTRY",
                user_id=None,
                ip_address=ip,
                snapshot_b64=image if image.startswith("data:") else f"data:image/jpeg;base64,{image}",
            ))
            db.commit()

        return FaceAuthResponse(matched=False, message="Spoofing Detected")

    try:
        max_faces = 2 if issue_token else ENTRY_MAX_FACES_PER_FRAME
        detected_faces = face_engine_service.detect_faces(image, max_faces=max_faces)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="Face recognition is temporarily unavailable.") from None

    if not detected_faces:
        return FaceAuthResponse(matched=False, message="no_face")

    if issue_token and len(detected_faces) > 1:
        return FaceAuthResponse(matched=False, message="multiple_faces")

    now = now_ph().replace(tzinfo=None)
    faces = []
    first_match = None
    recorded_user_ids = set()
    unknown_logged = False

    def log_unknown_face_once() -> None:
        nonlocal unknown_logged
        if unknown_logged:
            return
        unknown_logged = True
        security_logger.info("FACE_UNRECOGNIZED entry_gate")
        unknown_cutoff = now - timedelta(minutes=1)
        existing = (
            db.query(EntryLog)
            .filter(
                EntryLog.user_id.is_(None),
                EntryLog.granted == False,
                or_(
                    EntryLog.time_out >= unknown_cutoff,
                    and_(EntryLog.time_out.is_(None), EntryLog.accessed_at >= unknown_cutoff),
                ),
            )
            .order_by(_desc(EntryLog.accessed_at))
            .first()
        )
        if existing:
            existing.time_out = now
        else:
            db.add(EntryLog(
                user_id=None,
                entry_type="face_scan",
                granted=False,
                note="Unknown visitor",
                accessed_at=now,
                time_out=now,
            ))

    for face in detected_faces:
        match = face_engine_service.find_match_for_face(db, face, purpose="login" if issue_token else "gate")
        if match is None or match.user.status == "suspended":
            log_unknown_face_once()
            faces.append({
                "matched": False,
                "face_box": face.get("face_box"),
                "engine": face.get("engine"),
                "quality": face.get("quality"),
                "message": "not_recognized",
            })
            continue
        matched_user = match.user

        if matched_user.id in recorded_user_ids:
            session_action = "seen_in_frame"
        else:
            _, session_action = record_entry_scan(db, matched_user, seen_at=now)
            recorded_user_ids.add(matched_user.id)

        member_id = matched_user.member_id or f"RPL-{matched_user.id:05d}"
        face_result = {
            "matched": True,
            "user_id": matched_user.id,
            "member_id": member_id,
            "name": matched_user.name,
            "role": matched_user.role,
            "engine": match.engine,
            "score": match.score,
            "face_box": face.get("face_box"),
            "quality": face.get("quality"),
            "session_action": session_action,
            "message": "recognized",
        }
        faces.append(face_result)
        if first_match is None:
            first_match = (matched_user, face_result)

    db.commit()

    if first_match is None:
        return FaceAuthResponse(matched=False, faces=faces, message="not_recognized")

    matched_user, first_face = first_match
    _last_seen_by_ip[ip] = {"user_id": matched_user.id, "ts": time()}
    security_logger.info("FACE_ENTRY_SUCCESS user_id=%d", matched_user.id)

    token = _make_token(matched_user.id, db) if issue_token else None
    if issue_token:
        db.commit()
    if issue_token and response is not None and token:
        set_auth_cookie(response, token)

    return FaceAuthResponse(
        matched=True,
        user_id=matched_user.id,
        member_id=first_face["member_id"],
        name=matched_user.name,
        role=matched_user.role,
        engine=first_face.get("engine"),
        score=first_face.get("score"),
        face_box=first_face.get("face_box"),
        quality=first_face.get("quality"),
        faces=faces,
        token=token,
        message="recognized",
    )


@router.post("/face-lookup", response_model=FaceLookupResponse)
@limiter.limit("120/minute")
def face_lookup(
    request: Request,
    body: FaceAuthRequest,
    _librarian: User = Depends(require_librarian),
    db: Session = Depends(get_db),
):
    """
    Called by LibBorrowReturn QuickScanModal.
    Requires librarian JWT. Identifies member — no entry log, no JWT issued.
    """
    import services.face_engine_service as face_engine_service
    from services.liveness_service import check_liveness
    from models.security_alert import SecurityAlert
    from models.transaction import Transaction
    from services.loan_policy import sync_overdue_loans

    ip = _client_ip(request)

    # ── Liveness check ────────────────────────────────────────────────────────
    hint, real_prob = check_liveness(body.image)
    if hint == "too_dark":
        return FaceLookupResponse(matched=False, message="too_dark")
    if hint == "too_far":
        return FaceLookupResponse(matched=False, message="too_far")
    if hint == "retry":
        return FaceLookupResponse(matched=False, message="no_face")
    if hint == "spoof":
        # (Reverted: Just do nothing if it is fake)
        security_logger.warning("SPOOF_LOOKUP_DETECTED ip=%s prob=%.3f", ip, real_prob)
        db.add(SecurityAlert(
            alert_type="SPOOF_LOOKUP",
            user_id=None,
            ip_address=ip,
            snapshot_b64=body.image,
        ))
        db.commit()
        return FaceLookupResponse(matched=False, message="not_recognized")
    # hint == "ok" → proceed

    try:
        detected_faces = face_engine_service.detect_faces(body.image, max_faces=2)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="Face recognition is temporarily unavailable.") from None

    if not detected_faces:
        return FaceLookupResponse(matched=False, message="no_face")
    if len(detected_faces) > 1:
        return FaceLookupResponse(matched=False, message="multiple_faces")

    face = detected_faces[0]
    match = face_engine_service.find_match_for_face(db, face, purpose="login")
    if match is None:
        return FaceLookupResponse(matched=False, message="not_recognized")
    matched_user = match.user

    sync_overdue_loans(db, user_id=matched_user.id)

    active_loans = db.query(Transaction).filter(
        Transaction.user_id == matched_user.id,
        Transaction.status.in_(["active", "overdue"]),
    ).count()

    return FaceLookupResponse(
        matched=True,
        user_id=matched_user.id,
        name=matched_user.name,
        member_id=matched_user.member_id or f"RPL-{matched_user.id:05d}",
        active_loans=active_loans,
        engine=match.engine,
        score=match.score,
        quality=face.get("quality"),
        message="recognized",
    )


# ── Enroll / Re-enroll Face ───────────────────────────────────────────────────

@router.post("/enroll-face")
@limiter.limit("10/minute")
def enroll_face(
    request: Request,
    body: EnrollFaceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    import services.face_engine_service as face_engine_service
    from services.liveness_service import check_liveness
    from models.security_alert import SecurityAlert

    ip = _client_ip(request)

    # ── Liveness check ────────────────────────────────────────────────────────
    hint, real_prob = check_liveness(body.image)
    if hint == "too_dark":
        raise HTTPException(status_code=422, detail="The image is too dark. Try better lighting.")
    if hint == "too_far":
        raise HTTPException(status_code=422, detail="Your face is too far. Move closer to the camera.")
    if hint == "retry":
        raise HTTPException(status_code=422, detail="Could not verify liveness. Please try again.")
    if hint == "spoof":
        # (Reverted: Just do nothing if it is fake - but still log to DB)
        security_logger.warning("SPOOF_ENROLL_DETECTED ip=%s user_id=%d prob=%.3f", ip, current_user.id, real_prob)
        db.add(SecurityAlert(
            alert_type="SPOOF_ENROLL",
            user_id=current_user.id,
            ip_address=ip,
            snapshot_b64=body.image,
        ))
        db.commit()
        raise HTTPException(
            status_code=422,
            detail="Could not verify a live face. Please use your device's front camera directly.",
        )
    # hint == "ok" → proceed

    try:
        detected_faces = face_engine_service.detect_faces(body.image, max_faces=2)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="Face recognition is temporarily unavailable.") from None

    if not detected_faces:
        raise HTTPException(status_code=422, detail="No face detected in the image. Please try again with better lighting.")
    if len(detected_faces) > 1:
        raise HTTPException(status_code=422, detail="Multiple faces detected. Please enroll only one face.")

    face = detected_faces[0]
    duplicate = face_engine_service.find_duplicate_for_enrollment(db, face, current_user.id)
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail="This face is already registered to another account. Please contact the librarian if you believe this is an error.",
        )

    face_engine_service.store_enrollment_face(db, current_user, face)
    db.commit()

    return {"success": True, "message": "Face enrolled successfully"}
