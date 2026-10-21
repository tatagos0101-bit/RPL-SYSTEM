"""
Librarian dashboard endpoints — all require librarian JWT.

Covers:
  - Live KPI stats
  - Due / overdue books
  - Entry logs (face scan door)
  - Monthly borrow trend
  - Member management (list, suspend, reactivate)
  - Overdue reminder notification
"""
from datetime import datetime, timedelta

from timezone_utils import PH_TZ, now_ph
from decimal import Decimal

import uuid
import random
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from services.passwords import hash_password
from services.passwords import verify_password
from services.member_deletion import lock_existing_member, delete_face_data, delete_account
from limiter import limiter
from services.list_queries import member_query, reservation_query
from services.reservation_confirmation import cancel_locked_reservation
from services.email_identity import email_matches
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, desc, and_, or_, case

from database import get_db
from dependencies import require_librarian
from services.storage_service import save_upload, resolve_upload_url
from services.cloud_uploads import read_upload
from models.book import Book
from models.entry_log import EntryLog
from models.face_embedding import FaceEmbedding
from models.notification import Notification
from models.reservation import Reservation
from models.transaction import Transaction
from models.user import User
from services.auth_sessions import revoke_user_sessions
from services.loan_policy import sync_overdue_loans
from services.book_copy_service import ensure_book_copies
from services.reservation_policy import (
    promote_next_pending_reservation,
    renumber_pending_queue,
    sync_expired_reservations,
)
from services.password_reset import expire_unused_reset_codes_for_user
from services.upload_validation import ID_EXTS, validate_upload_bytes
from schemas.auth import EnrollFaceRequest
from schemas.librarian import (
    DashboardStats, BorrowTrendPoint,
    DueBookOut, EntryLogOut,
    LibMemberOut, LibMemberStats, MemberStatusUpdate,
    NotificationOut, LibReservationOut, MemberReservationOut,
    MemberActiveLoanOut, MemberDeletionRequest,
)

router = APIRouter(prefix="/api/librarian", tags=["Librarian"])

_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L

def _generate_member_id(db) -> str:
    """Generate a unique random Member ID like RPL-K7X2M."""
    while True:
        mid = "RPL-" + "".join(random.choices(_ID_CHARS, k=5))
        if not db.query(User).filter(User.member_id == mid).first():
            return mid


def _now() -> datetime:
    return now_ph()


def _days_left(due_date: datetime) -> int:
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=PH_TZ)
    return (due_date - _now()).days


def _calc_fine(due_date: datetime) -> Decimal:
    from config import FINE_PER_DAY
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=PH_TZ)
    days_late = max(0, (_now() - due_date).days)
    return Decimal(days_late * FINE_PER_DAY)


def _loan_status(days_left: int) -> str:
    if days_left < 0:
        return "overdue"
    if days_left <= 3:
        return "due-soon"
    return "active"


def _active_face_embedding_exists(db: Session, user_id: int) -> bool:
    return (
        db.query(FaceEmbedding.id)
        .filter(FaceEmbedding.user_id == user_id, FaceEmbedding.is_active == True)
        .first()
        is not None
    )


def _face_enrolled(db: Session, user: User) -> bool:
    return bool(user.face_encoding) or _active_face_embedding_exists(db, user.id)


# ── Dashboard KPIs ────────────────────────────────────────────────────────────

@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(
    db: Session = Depends(get_db),
    _:  User    = Depends(require_librarian),
):
    sync_overdue_loans(db)
    today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)

    visitors_today = (
        db.query(func.count(EntryLog.id))
        .filter(EntryLog.accessed_at >= today_start, EntryLog.granted == True)
        .scalar()
    )

    active_loans = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.status.in_(["active", "overdue"]))
        .scalar()
    )

    overdue_count = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.status == "overdue")
        .scalar()
    )

    due_soon_count = (
        db.query(func.count(Transaction.id))
        .filter(
            Transaction.status  == "active",
            Transaction.due_date >= _now(),
            Transaction.due_date <= _now() + timedelta(days=3),
        )
        .scalar()
    )

    total_members = db.query(func.count(User.id)).filter(User.role == "member", User.deleted_at.is_(None)).scalar()

    pending_registrations = (
        db.query(func.count(User.id))
        .outerjoin(
            FaceEmbedding,
            and_(FaceEmbedding.user_id == User.id, FaceEmbedding.is_active == True),
        )
        .filter(User.role == "member", User.deleted_at.is_(None), User.face_encoding.is_(None), FaceEmbedding.id.is_(None))
        .scalar()
    )

    total_books     = db.query(func.sum(Book.copies_total)).scalar()     or 0
    available_books = db.query(func.sum(Book.copies_available)).scalar() or 0

    return DashboardStats(
        visitors_today        = visitors_today,
        active_loans          = active_loans,
        overdue_count         = overdue_count,
        due_soon_count        = due_soon_count,
        total_members         = total_members,
        pending_registrations = pending_registrations,
        total_books           = total_books,
        available_books       = available_books,
    )


# ── Monthly borrow trend (last 6 months) ─────────────────────────────────────

@router.get("/borrow-trend", response_model=list[BorrowTrendPoint])
def borrow_trend(
    months: int     = Query(6, ge=1, le=24),
    db:     Session = Depends(get_db),
    _:      User    = Depends(require_librarian),
):
    points = []
    now    = _now()

    for i in range(months - 1, -1, -1):
        # First day of each month going back
        month_dt    = (now.replace(day=1) - timedelta(days=i * 28)).replace(day=1)
        next_month  = (month_dt.replace(day=28) + timedelta(days=4)).replace(day=1)

        count = (
            db.query(func.count(Transaction.id))
            .filter(
                Transaction.borrow_date.isnot(None),
                Transaction.borrow_date >= month_dt,
                Transaction.borrow_date <  next_month,
            )
            .scalar()
        )

        label = month_dt.strftime("%b %Y")   # e.g. "Jan 2026"
        points.append(BorrowTrendPoint(month=label, borrows=count))

    return points


# ── Due / Overdue books ───────────────────────────────────────────────────────

@router.get("/due-books", response_model=list[DueBookOut])
def due_books(
    filter: str = Query("all", description="all | overdue | due-soon"),
    db:     Session = Depends(get_db),
    _:      User    = Depends(require_librarian),
):
    sync_overdue_loans(db)
    if filter not in ("all", "overdue", "due-soon"):
        raise HTTPException(status_code=400, detail="Filter must be 'all', 'overdue', or 'due-soon'")

    q = db.query(Transaction).filter(Transaction.status.in_(["active", "overdue"]))

    if filter == "overdue":
        q = q.filter(Transaction.status == "overdue")
    elif filter == "due-soon":
        q = q.filter(
            Transaction.status  == "active",
            Transaction.due_date >= _now(),
            Transaction.due_date <= _now() + timedelta(days=3),
        )
    else:
        # All active loans that are overdue or due within 7 days
        q = q.filter(Transaction.due_date <= _now() + timedelta(days=7))

    txs = q.order_by(Transaction.due_date).all()

    result = []
    for tx in txs:
        dl    = _days_left(tx.due_date)
        fine  = _calc_fine(tx.due_date)
        result.append(DueBookOut(
            transaction_id = tx.id,
            user_id        = tx.user_id,
            book_id        = tx.book_id,
            member_name    = tx.user.name          if tx.user else "Unknown",
            member_id      = (tx.user.member_id or f"RPL-{tx.user.id:05d}") if tx.user else "—",
            book_title     = tx.book.title         if tx.book else "Unknown",
            book_qr        = tx.book.qr_code       if tx.book else None,
            borrow_date    = tx.borrow_date,
            due_date       = tx.due_date,
            days_left      = dl,
            fine_amount    = fine,
            status         = _loan_status(dl),
        ))
    return result


# ── Entry logs ────────────────────────────────────────────────────────────────

@router.get("/entry-logs", response_model=list[EntryLogOut])
def entry_logs(
    skip:  int = Query(0,  ge=0),
    limit: int = Query(50, ge=1, le=200),
    db:    Session = Depends(get_db),
    _:     User    = Depends(require_librarian),
):
    logs = (
        db.query(EntryLog)
        .order_by(desc(EntryLog.accessed_at))
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []
    for log in logs:
        result.append(EntryLogOut(
            id          = log.id,
            member_name = log.user.name              if log.user else None,
            member_id   = (log.user.member_id or f"RPL-{log.user.id:05d}") if log.user else None,
            entry_type  = log.entry_type,
            granted     = log.granted,
            is_inside   = bool(log.granted and log.time_out is None),
            note        = log.note,
            accessed_at = log.accessed_at,
            time_out    = log.time_out,
        ))
    return result


# ── Members list ──────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[LibMemberOut])
def list_members(
    search: str = Query("", max_length=200, description="Search by name, email, or member ID"),
    status: str = Query("", description="Filter: active | suspended"),
    skip:   int = Query(0,  ge=0),
    limit:  int = Query(50, ge=1, le=200),
    db:     Session = Depends(get_db),
    _:      User    = Depends(require_librarian),
):
    q = member_query(db, search, status)

    members = q.order_by(User.created_at.desc(), User.id.desc()).offset(skip).limit(limit).all()
    member_ids = [m.id for m in members]
    counts = {row.user_id: row for row in db.query(Transaction.user_id,
        func.sum(case((Transaction.status.in_(['active', 'overdue']), 1), else_=0)).label('active'),
        func.count(Transaction.borrow_date).label('total'))
        .filter(Transaction.user_id.in_(member_ids)).group_by(Transaction.user_id).all()}
    enrolled_ids = {
        row[0] for row in db.query(FaceEmbedding.user_id).filter(
            FaceEmbedding.user_id.in_(member_ids), FaceEmbedding.is_active.is_(True)).distinct().all()}

    result = []
    for m in members:
        count = counts.get(m.id)
        result.append(LibMemberOut(
            id           = m.id,
            member_id    = m.member_id or f"RPL-{m.id:05d}",
            name         = m.name,
            email        = m.email,
            phone        = m.phone,
            email_verified = bool(m.email_verified),
            phone_verified = bool(m.phone_verified),
            location     = m.location,
            status       = m.status,
            face_enrolled = bool(m.face_encoding) or m.id in enrolled_ids,
            active_loans = count.active if count else 0,
            total_loans  = count.total if count else 0,
            joined_at    = m.created_at,
        ))
    return result


@router.get("/users/count")
def count_members(search: str = Query("", max_length=200), status: str = Query(""),
                  db: Session = Depends(get_db), _: User = Depends(require_librarian)):
    return {"total": member_query(db, search, status).count()}

# ── Member stats ──────────────────────────────────────────────────────────────

@router.get("/users/stats", response_model=LibMemberStats)
def member_stats(
    db: Session = Depends(get_db),
    _:  User    = Depends(require_librarian),
):
    enrolled = or_(and_(User.face_encoding.isnot(None), User.face_encoding != ''),
        db.query(FaceEmbedding.id).filter(FaceEmbedding.user_id == User.id,
                                         FaceEmbedding.is_active.is_(True)).exists())
    counts = db.query(func.count(User.id),
        func.sum(case((User.status == 'active', 1), else_=0)),
        func.sum(case((User.status == 'suspended', 1), else_=0)),
        func.sum(case((enrolled, 1), else_=0))).filter(User.role == 'member', User.deleted_at.is_(None)).one()
    return LibMemberStats(
        total=counts[0], active=counts[1] or 0,
        suspended=counts[2] or 0, enrolled=counts[3] or 0,
    )


# ── Register new member (librarian-assisted) ─────────────────────────────────




def _generate_temporary_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.islower() for c in password) and any(c.isupper() for c in password) and any(c.isdigit() for c in password):
            return password


@router.post("/users/register", status_code=201)
async def register_member(
    name:     str              = Form(..., max_length=120),
    email:    str | None       = Form(None, max_length=180),
    phone:    str | None       = Form(None, max_length=30),
    location: str              = Form(..., max_length=120),
    id_image: UploadFile | None = File(None),
    upload_ticket: str | None = Form(None),
    db:       Session          = Depends(get_db),
    _:        User             = Depends(require_librarian),
):
    """Librarian registers a new member with a valid government ID upload."""
    email = email.lower().strip() if email else None
    name  = name.strip()

    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty.")
    if not location or not location.strip():
        raise HTTPException(status_code=422, detail="Address is required.")

    if email and email_matches(db, email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    content, original_filename, reference = await read_upload(folder="ids", user_id=_.id, file=id_image, ticket=upload_ticket)
    ext = validate_upload_bytes(
        content=content,
        filename=original_filename,
        allowed_exts=ID_EXTS,
        max_bytes=10 * 1024 * 1024,
        human_label="ID image",
    )

    filename = f"{uuid.uuid4().hex}{ext}"
    id_reference = reference or save_upload("ids", filename, content)

    temporary_password = _generate_temporary_password()
    new_user = User(
        name          = name,
        email         = email or None,
        password_hash = hash_password(temporary_password),
        must_change_password = True,
        email_verified = False,
        phone_verified = False,
        role          = "member",
        phone         = phone.strip() if phone else None,
        location      = location.strip(),
        status        = "active",
        id_image_url  = id_reference,
        member_id     = _generate_member_id(db),
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Registration conflicts with an existing account. Refresh and check before retrying.') from None
    db.refresh(new_user)

    return {
        "success":          True,
        "id":               new_user.id,
        "member_id":        new_user.member_id,
        "name":             new_user.name,
        "email":            new_user.email,
        "email_verified":   bool(new_user.email_verified),
        "phone_verified":   bool(new_user.phone_verified),
        "temporary_password": temporary_password,
    }


@router.get("/users/{user_id}/id-document")
def get_member_id_document(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_librarian),
):
    member = db.query(User).filter(User.id == user_id).first()
    if not member or not member.id_image_url:
        raise HTTPException(404, "ID document not found.")
    return {"url": resolve_upload_url(member.id_image_url)}


@router.post("/users/{user_id}/reset-password")
def reset_member_password(
    user_id: int,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    member = lock_existing_member(db, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    temporary_password = _generate_temporary_password()
    member.password_hash = hash_password(temporary_password)
    member.must_change_password = True
    revoke_user_sessions(db, member.id)
    expire_unused_reset_codes_for_user(db, member.id)
    db.commit()

    return {
        "success": True,
        "id": member.id,
        "member_id": member.member_id,
        "name": member.name,
        "email": member.email,
        "temporary_password": temporary_password,
    }


# ── Suspend / reactivate member ───────────────────────────────────────────────

@router.put("/users/{user_id}/status")
def update_member_status(
    user_id: int,
    body:    MemberStatusUpdate,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    if body.status not in ("active", "suspended"):
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'suspended'")

    member = lock_existing_member(db, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member.status = body.status
    if body.status == "suspended":
        revoke_user_sessions(db, member.id)
    db.commit()

    return {
        "success": True,
        "member_id": member.member_id or f"RPL-{member.id:05d}",
        "name": member.name,
        "status": member.status,
    }


# ── Enroll face for a member (librarian-assisted) ────────────────────────────

@router.delete("/users/{user_id}/face", status_code=204)
@limiter.limit("5/minute")
def delete_member_face(user_id: int, body: MemberDeletionRequest, request: Request,
                       db: Session = Depends(get_db), librarian: User = Depends(require_librarian)):
    if not verify_password(body.current_password, librarian.password_hash):
        raise HTTPException(403, "Your librarian password is incorrect.")
    member = lock_existing_member(db, user_id)
    delete_face_data(db, member)
    db.commit()


@router.delete("/users/{user_id}", status_code=204)
@limiter.limit("5/minute")
def delete_member_account(user_id: int, body: MemberDeletionRequest, request: Request,
                          db: Session = Depends(get_db), librarian: User = Depends(require_librarian)):
    if not verify_password(body.current_password, librarian.password_hash):
        raise HTTPException(403, "Your librarian password is incorrect.")
    member = lock_existing_member(db, user_id, allow_deleted=True)
    delete_account(db, member)
    db.commit()

@router.post("/users/{user_id}/enroll-face")
def librarian_enroll_face(
    user_id: int,
    body:    EnrollFaceRequest,
    request: Request,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    """
    Allows a librarian to enroll (or re-enroll) a face for any member.
    """
    import services.face_engine_service as face_engine_service
    from logger import security_logger

    member = lock_existing_member(db, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()

    try:
        detected_faces = face_engine_service.detect_faces(body.image, max_faces=2)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="Face recognition is temporarily unavailable.") from None

    if not detected_faces:
        raise HTTPException(
            status_code=422,
            detail="No face detected in the image. Please try again with better lighting.",
        )
    if len(detected_faces) > 1:
        raise HTTPException(
            status_code=422,
            detail="Multiple faces detected. Please enroll only one face.",
        )

    face = detected_faces[0]
    duplicate = face_engine_service.find_duplicate_for_enrollment(db, face, user_id)
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail=f"This face is already registered to another account ({duplicate.user.name}).",
        )

    face_engine_service.store_enrollment_face(db, member, face)
    db.commit()

    return {"success": True, "message": f"Face enrolled for {member.name}"}


# ── Overdue reminder (logs notification — real email/SMS in Phase 5) ──────────

@router.post("/notify/{transaction_id}")
def notify_member(
    transaction_id: int,
    db:             Session = Depends(get_db),
    _:              User    = Depends(require_librarian),
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    sync_overdue_loans(db, user_id=tx.user_id)
    db.refresh(tx)
    if tx.status not in ("active", "overdue"):
        raise HTTPException(status_code=400, detail="Transaction is not active or overdue")

    dl = _days_left(tx.due_date)
    if dl >= 0:
        raise HTTPException(status_code=400, detail="Book is not yet overdue")

    raise HTTPException(501, 'Overdue reminder delivery is unavailable. No email or SMS was sent.')


# ── Reservation notifications ─────────────────────────────────────────────────

@router.get("/notifications", response_model=list[NotificationOut])
def get_notifications(
    unread_only: bool    = False,
    limit:       int     = Query(50, ge=1, le=200),
    db:          Session = Depends(get_db),
    _:           User    = Depends(require_librarian),
):
    q = db.query(Notification).filter(Notification.user_id.is_(None))
    if unread_only:
        q = q.filter(Notification.is_read == False)
    notifs = q.order_by(desc(Notification.created_at)).limit(limit).all()
    return [
        NotificationOut(
            id             = n.id,
            message        = n.message,
            type           = n.type,
            member_name    = n.member_name,
            book_title     = n.book_title,
            reservation_id = n.reservation_id,
            is_read        = n.is_read,
            created_at     = n.created_at,
        )
        for n in notifs
    ]


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db:              Session = Depends(get_db),
    _:               User    = Depends(require_librarian),
):
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id.is_(None),
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    return {"success": True}


@router.post("/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    _:  User    = Depends(require_librarian),
):
    db.query(Notification).filter(
        Notification.user_id.is_(None),
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"success": True}


# ── All reservations (librarian view) ────────────────────────────────────────

@router.get("/reservations", response_model=list[LibReservationOut])
def all_reservations(
    status: str = Query("", description="Filter: pending | ready | all"),
    search: str = Query("", max_length=200, description="Search by member name or book title"),
    db:     Session = Depends(get_db),
    _:      User    = Depends(require_librarian),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    sync_expired_reservations(db)
    q = reservation_query(db, search, status)
    reservations = q.options(joinedload(Reservation.book), joinedload(Reservation.user)).order_by(
        Reservation.reserved_at, Reservation.id).offset(skip).limit(limit).all()

    return [
        LibReservationOut(
            id             = r.id,
            member_name    = r.user.name          if r.user else "Unknown",
            member_id      = (r.user.member_id or f"RPL-{r.user.id:05d}") if r.user else "—",
            book_title     = r.book.title         if r.book else "Unknown",
            book_author    = r.book.author        if r.book else "",
            cover_url      = r.book.cover_url     if r.book else None,
            status         = r.status,
            queue_position = r.queue_position,
            reserved_at    = r.reserved_at,
            expires_at     = r.expires_at,
        )
        for r in reservations
    ]


@router.get("/reservations/count")
def count_reservations(search: str = Query('', max_length=200), status: str = Query(''),
                       db: Session = Depends(get_db), _: User = Depends(require_librarian)):
    sync_expired_reservations(db)
    counts = dict(reservation_query(db, search, status).with_entities(
        Reservation.status, func.count(Reservation.id)).group_by(Reservation.status).all())
    return {'total': sum(counts.values()), 'ready': counts.get('ready', 0), 'pending': counts.get('pending', 0)}


@router.get("/member/{user_id}/reservations", response_model=list[MemberReservationOut])
def member_reservations(
    user_id: int,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    """Return a specific member's pending/ready reservations (for the borrow flow)."""
    sync_expired_reservations(db, user_id=user_id)
    reservations = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == user_id,
            Reservation.status.in_(["pending", "ready"]),
        )
        .order_by(Reservation.reserved_at)
        .all()
    )
    return [
        MemberReservationOut(
            id             = r.id,
            book_id        = r.book_id,
            book_title     = r.book.title     if r.book else "Unknown",
            book_author    = r.book.author    if r.book else "",
            book_qr        = r.book.qr_code   if r.book else None,
            cover_url      = r.book.cover_url if r.book else None,
            status         = r.status,
            queue_position = r.queue_position,
            reserved_at    = r.reserved_at,
            expires_at     = r.expires_at,
        )
        for r in reservations
    ]


@router.get("/member/{user_id}/active-loans", response_model=list[MemberActiveLoanOut])
def member_active_loans(
    user_id: int,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    """Return a member's currently active/overdue borrow transactions for the return flow."""
    sync_overdue_loans(db, user_id=user_id)
    ensure_book_copies(db)
    loans = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.status.in_(["active", "overdue"]),
            Transaction.type == "borrow",
        )
        .order_by(Transaction.borrow_date)
        .all()
    )
    return [
        MemberActiveLoanOut(
            transaction_id = tx.id,
            book_id        = tx.book_id,
            copy_id        = tx.copy_id,
            copy_qr        = tx.copy.qr_code if tx.copy else None,
            copy_number    = tx.copy.copy_number if tx.copy else None,
            book_title     = tx.book.title     if tx.book else "Unknown",
            book_author    = tx.book.author    if tx.book else "",
            cover_url      = tx.book.cover_url if tx.book else None,
            borrow_date    = tx.borrow_date,
            due_date       = tx.due_date,
            days_left      = _days_left(tx.due_date) if tx.due_date else 0,
            fine_amount    = _calc_fine(tx.due_date) if tx.due_date else Decimal(0),
            status         = tx.status,
        )
        for tx in loans
    ]


@router.delete("/reservations/{reservation_id}", status_code=204)
def cancel_reservation_librarian(
    reservation_id: int,
    db:             Session = Depends(get_db),
    _:              User    = Depends(require_librarian),
):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    cancel_locked_reservation(db, reservation)
    db.commit()
