import hashlib
import hmac
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_librarian, require_member
from limiter import limiter
from models.account_deletion_notice import AccountDeletionNotice as Notice
from models.library_settings import LibrarySetting
from models.user import User
from schemas.account_notice import NoticeView
from schemas.librarian import MemberDeletionRequest
from services import account_inactivity as policy
from services.member_deletion import lock_existing_member
from services.passwords import verify_password
from timezone_utils import now_ph

router = APIRouter(prefix="/api")
RULES = {"inactivity_months": 6, "response_hours": 72}


def confirm(actor, body):
    if not verify_password(body.current_password, actor.password_hash):
        raise HTTPException(403, "Incorrect current password.")


@router.get("/librarian/account-notices")
def notices(status: Literal["pending", "ready_for_review", "cancelled", "deleted", "all"] = "pending",
            skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
            db: Session = Depends(get_db), actor=Depends(require_librarian)):
    query = db.query(Notice).join(User, User.id == Notice.user_id)
    renewed = policy.newer_activity(Notice.last_activity_at)
    if status in ("pending", "ready_for_review"):
        query = query.filter(Notice.status == "pending", ~renewed)
        if status == "ready_for_review":
            query = query.filter(Notice.respond_by <= now_ph())
    elif status == "cancelled":
        query = query.filter(or_(Notice.status == "cancelled", (Notice.status == "pending") & renewed))
    elif status == "deleted":
        query = query.filter(Notice.status == status)
    rows = query.order_by(Notice.created_at.desc(), Notice.id.desc()).offset(skip).limit(limit).all()
    return dict(items=[policy.view(db, row) for row in rows], total=query.count(), **RULES)


@router.get("/librarian/member/{user_id}/account-notice")
def review(user_id: int, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    member = lock_existing_member(db, user_id)
    activity = policy.latest_activity(db, member)
    loans = db.scalar(select(policy.outstanding(user_id)))
    now = now_ph()
    notice = policy.latest_notice(db, user_id)
    return dict(notice=policy.view(db, notice) if notice else None, last_activity_at=activity,
        inactive_days=(now.date() - activity.date()).days if activity is not None else None, has_outstanding_loans=loans,
        eligible=activity is not None and not loans and activity <= policy.cutoff(now), **RULES)


@router.post("/librarian/member/{user_id}/account-notice", response_model=NoticeView)
@limiter.limit("5/minute")
def send(request: Request, user_id: int, body: MemberDeletionRequest, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    confirm(actor, body)
    notice = policy.create(db, user_id)
    policy.deliver(db, notice.id)
    return policy.view(db, notice)


@router.post("/librarian/account-notices/check")
def check(db: Session = Depends(get_db), actor=Depends(require_librarian)):
    return policy.check(db)


@router.post("/librarian/account-notices/{notice_id}/record-reply", response_model=NoticeView)
def record_reply(notice_id: UUID, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    return policy.view(db, policy.reply(db, str(notice_id)))


@router.post("/librarian/account-notices/{notice_id}/approve")
@limiter.limit("5/minute")
def approve(request: Request, notice_id: UUID, body: MemberDeletionRequest, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    confirm(actor, body)
    policy.approve(db, str(notice_id))
    return {"status": "deleted"}


@router.get("/user/account-notice")
def mine(db: Session = Depends(get_db), actor=Depends(require_member)):
    notice = policy.latest_notice(db, actor.id)
    return {"notice": policy.view(db, notice) if notice else None}


@router.post("/user/account-notices/{notice_id}/keep", response_model=NoticeView)
def keep(notice_id: UUID, db: Session = Depends(get_db), actor=Depends(require_member)):
    return policy.view(db, policy.reply(db, str(notice_id), actor.id))


class JobOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dry_run: StrictBool = False


@router.post("/internal/account-inactivity/check")
def job(body: JobOptions | None = None, authorization: str | None = Header(None), db: Session = Depends(get_db)):
    end = policy.job_deadline()
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 256 or not token.isascii() or any(c.isspace() for c in token):
        raise HTTPException(401, "Invalid job credential.")
    with policy.job_session(db, end) as scoped:
        setting = scoped.get(LibrarySetting, "account_inactivity_job_digest")
        digest = hashlib.sha256(token.encode()).hexdigest()
        if not setting or not hmac.compare_digest(setting.value.encode(), digest.encode()):
            raise HTTPException(401, "Invalid job credential.")
        return policy.check_batch(scoped, end, dry_run=bool(body and body.dry_run))
