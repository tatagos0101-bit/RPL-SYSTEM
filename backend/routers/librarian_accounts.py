"""Main-librarian staff provisioning, separate from member registration."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from limiter import limiter
from logger import security_logger
from models.user import User
from schemas.librarian_accounts import (
    LibrarianAccountCreate, LibrarianAccountCreated, LibrarianAccountOut, LibrarianAccountsPage,
)
from services.email_identity import email_matches, normalize_email
from services.librarian_accounts import (
    new_staff_member_id, require_librarian_account_manager, temporary_staff_password,
)
from services.passwords import hash_password, verify_password
from services.registration_delivery import deliver_registration_credentials

router = APIRouter(prefix="/api/librarian/staff", tags=["Librarian accounts"])


def account_out(user, manager_id):
    return LibrarianAccountOut(
        id=user.id, member_id=user.member_id, name=user.name, email=user.email,
        status=user.status, created_at=user.created_at,
        must_change_password=bool(user.must_change_password),
        is_main_librarian=user.id == manager_id,
    )


@router.get("", response_model=LibrarianAccountsPage)
def list_librarians(
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    manager: User = Depends(require_librarian_account_manager),
):
    response.headers["Cache-Control"] = "no-store"
    query = db.query(User.id, User.member_id, User.name, User.email, User.status,
                     User.created_at, User.must_change_password).filter(
        User.role == "librarian", User.deleted_at.is_(None))
    return LibrarianAccountsPage(
        items=[account_out(row, manager.id) for row in query.order_by(User.id).offset((page - 1) * page_size).limit(page_size)],
        total=query.count(), page=page, page_size=page_size,
    )


@router.post("", response_model=LibrarianAccountCreated, status_code=201)
@limiter.limit("5/minute")
def create_librarian(
    request: Request,
    response: Response,
    body: LibrarianAccountCreate,
    db: Session = Depends(get_db),
    manager: User = Depends(require_librarian_account_manager),
):
    response.headers["Cache-Control"] = "no-store"
    if not verify_password(body.current_password, manager.password_hash):
        raise HTTPException(403, "Your current password is incorrect.")
    email = normalize_email(str(body.email))
    if email_matches(db, email):
        raise HTTPException(409, "An account with this email already exists. Check the account before trying again.")
    password = temporary_staff_password()
    user = User(name=body.name, email=email, role="librarian", status="active",
                member_id=new_staff_member_id(db), password_hash=hash_password(password),
                must_change_password=True, email_verified=False, phone_verified=False)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Account details conflict with an existing record. Check the account before trying again.") from None
    db.refresh(user)
    security_logger.info("LIBRARIAN_ACCOUNT_CREATED actor_id=%d user_id=%d", manager.id, user.id)
    # Commit before delivery; transport failure must not create a second account.
    delivery = deliver_registration_credentials(member_id=user.member_id, temporary_password=password, email=user.email)
    return LibrarianAccountCreated(
        account=account_out(user, manager.id), password_delivery=delivery,
        temporary_password=None if delivery["status"] == "accepted" else password,
    )
