"""Librarian-only ID checks; members cannot replace their verified identity."""
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from database import get_db
from dependencies import require_librarian
from limiter import limiter
from models.user import User
from services.cloud_uploads import read_upload
from services.identity_documents import (checked_id_upload, inspect_document, issue_review_token,
    mark_identity_verified)
from services.member_deletion import lock_existing_member
from services.passwords import verify_password
from services.storage_service import save_upload
from services.upload_validation import IMAGE_EXTS, validate_upload_bytes

router = APIRouter(prefix="/api/librarian", tags=["Identity verification"])


@router.post("/identity/inspect")
@limiter.limit("10/minute")
async def inspect_id(request: Request, response: Response, id_image: UploadFile | None = File(None),
    upload_ticket: str | None = Form(None), actor: User = Depends(require_librarian)):
    content, filename, _reference = await read_upload(folder="ids", user_id=actor.id, file=id_image, ticket=upload_ticket)
    validate_upload_bytes(content=content, filename=filename, allowed_exts=IMAGE_EXTS,
        max_bytes=10 * 1024 * 1024, human_label="Photo ID")
    check = await run_in_threadpool(inspect_document, content)
    response.headers["Cache-Control"] = "no-store"
    return {"review_token": issue_review_token(check, actor.id), "document_type": check.kind,
        "suggested_name": check.suggested_name, "suggested_location": check.suggested_location,
        "message": "Readable photo ID detected. Check the original ID, expiry and security features, and compare the portrait with the person present. This automated check does not authenticate the issuer."}


@router.post("/users/{user_id}/verify-identity")
@limiter.limit("5/minute")
async def verify_member_identity(user_id: int, request: Request, response: Response,
    current_password: str = Form(..., max_length=512), identity_checked: bool = Form(False),
    id_review_token: str | None = Form(None), id_image: UploadFile | None = File(None),
    upload_ticket: str | None = Form(None), db: Session = Depends(get_db), actor: User = Depends(require_librarian)):
    if not verify_password(current_password, actor.password_hash):
        raise HTTPException(403, "Your librarian password is incorrect.")
    if not identity_checked:
        raise HTTPException(422, "Confirm that the member is present and the original ID matches their verified account name.")
    member = lock_existing_member(db, user_id)
    if member.id_verified_at:
        raise HTTPException(409, "This account already has a verified ID. Contact the library administrator for an identity correction.")
    content, extension, reference, claims = await checked_id_upload(actor.id, id_image, upload_ticket, id_review_token)
    if db.query(User.id).filter(User.id_document_digest == claims["digest"], User.id != member.id).first():
        raise HTTPException(409, "This ID upload is already linked to another account. Review the member's identity with the library administrator.")
    reference = reference or await run_in_threadpool(save_upload, "ids", f"{uuid.uuid4().hex}{extension}", content)
    mark_identity_verified(member, claims, actor.id, reference)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This ID was linked to another account while you were reviewing it. Refresh before retrying.") from None
    response.headers["Cache-Control"] = "no-store"
    return {"success": True, "message": "ID verified in person. This member can now enroll their face online."}
