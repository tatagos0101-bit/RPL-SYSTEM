import secrets

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_librarian, require_member
from limiter import limiter
from models.book import Book
from models.book_copy import BookCopy
from models.member_application import MemberApplication
from models.notification import Notification
from models.transaction import Transaction
from models.user import User
from schemas.library_workflows import (AccountActionRequest, ApplicationRequest,
    ApplicationReviewRequest, CopyConditionRequest, TERMS_VERSION)
from services.email_identity import normalize_email
from services.member_accountability import accountability, apply_account_action
from services.member_deletion import lock_existing_member
from services.reservation_policy import promote_next_pending_reservation
from timezone_utils import as_ph, now_ph

router = APIRouter(tags=["Library workflows"])


@router.post("/api/membership/applications", status_code=201)
@limiter.limit("5/minute")
def apply_membership(request: Request, response: Response, body: ApplicationRequest, db: Session = Depends(get_db)):
    application = MemberApplication(receipt="RPL-APP-" + secrets.token_urlsafe(18),
        name=body.name, location=body.location, email=normalize_email(body.email) if body.email else None,
        terms_version=TERMS_VERSION)
    db.add(application)
    db.add(Notification(type="member_application", message="A new remote membership application is waiting for librarian review."))
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return {"receipt": application.receipt, "status": application.status,
        "submitted_at": as_ph(application.submitted_at), "name": application.name,
        "message": "Application received. Bring this receipt and your original government photo ID to the library. A librarian must verify your identity in person and upload the required ID before creating your account."}


@router.get("/api/librarian/applications")
def list_applications(status: str = Query("pending", pattern="^(pending|approved|rejected)$"),
    skip: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db), _: User = Depends(require_librarian)):
    query = db.query(MemberApplication).filter_by(status=status)
    return {"total": query.count(), "items": [{"id": row.id, "receipt": row.receipt,
        "name": row.name, "email": row.email, "location": row.location, "status": row.status,
        "submitted_at": as_ph(row.submitted_at), "reviewed_at": as_ph(row.reviewed_at) if row.reviewed_at else None,
        "review_reason": row.review_reason, "review_notes": row.review_notes, "member_user_id": row.member_user_id}
        for row in query.order_by(MemberApplication.id.desc()).offset(skip).limit(limit).all()]}


@router.post("/api/librarian/applications/{application_id}/review")
async def review_application(application_id: int, body: ApplicationReviewRequest,
    response: Response, db: Session = Depends(get_db), actor: User = Depends(require_librarian)):
    row = db.query(MemberApplication).filter_by(id=application_id).with_for_update().first()
    if not row:
        raise HTTPException(404, "Application not found.")
    if row.status != "pending":
        raise HTTPException(409, "This application has already been reviewed. Refresh the list.")
    if body.decision == "approve":
        raise HTTPException(422, "Create the account through in-person registration with a required photo ID. Select this application from the librarian application list.")
    if body.reason == "details_verified":
        raise HTTPException(422, "Choose the reason this application cannot be approved.")
    row.reviewed_at, row.reviewed_by_id = now_ph(), actor.id
    row.review_reason, row.review_notes = body.reason, (body.notes or "").strip() or None
    row.status = "rejected"
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return {"status": row.status, "receipt": row.receipt}


@router.get("/api/librarian/users/{user_id}/accountability")
def member_accountability(user_id: int, skip: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db), _: User = Depends(require_librarian)):
    return accountability(db, lock_existing_member(db, user_id), skip, limit)


@router.get("/api/user/accountability")
def own_accountability(skip: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db), member: User = Depends(require_member)):
    return accountability(db, member, skip, limit)


@router.post("/api/librarian/users/{user_id}/actions")
def record_account_action(user_id: int, body: AccountActionRequest,
    db: Session = Depends(get_db), actor: User = Depends(require_librarian)):
    member = lock_existing_member(db, user_id)
    apply_account_action(db, member, actor, body)
    db.commit()
    return {"status": member.status, "is_blacklisted": member.is_blacklisted}


@router.put("/api/inventory/book-copies/{copy_id}/condition")
def update_copy_condition(copy_id: int, body: CopyConditionRequest,
    db: Session = Depends(get_db), actor: User = Depends(require_librarian)):
    copy = db.get(BookCopy, copy_id)
    if not copy:
        raise HTTPException(404, "Copy not found.")
    book = db.query(Book).filter_by(id=copy.book_id).with_for_update().populate_existing().one()
    db.refresh(copy)
    if copy.status in ("borrowed", "retired") or db.query(Transaction.id).filter(
        Transaction.copy_id == copy.id, Transaction.status.in_(["active", "overdue"])).first():
        raise HTTPException(409, "Inspect an on-loan copy through the return workflow. Retired copies cannot be restored here.")
    copy.condition = body.condition
    copy.status = body.condition if body.condition in ("damaged", "lost") else "available"
    db.flush()
    book.copies_available = db.query(BookCopy).filter_by(book_id=book.id, status="available").count()
    from services.borrowing_capacity import active_reservation_filter
    from models.reservation import Reservation
    holds = db.query(Reservation).filter(Reservation.book_id == book.id, Reservation.status == "ready", active_reservation_filter()).count()
    if holds > book.copies_available:
        raise HTTPException(409, "This change would remove stock held for ready reservations. Review those reservations first.")
    db.add(Notification(type="copy_inspection", book_title=book.title,
        message=f'Copy {copy.qr_code} inspected by librarian #{actor.id}: {body.condition}; {body.reason}. {body.notes.strip()}'))
    promote_next_pending_reservation(db, book.id)
    db.commit()
    return {"copy_id": copy.id, "status": copy.status, "condition": copy.condition}
