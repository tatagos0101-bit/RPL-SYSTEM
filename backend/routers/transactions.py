"""
Borrow / Return / Transaction history endpoints.

Borrow flow  (librarian calls after face + QR scan):
  POST /api/transactions/borrow  { user_id, book_id }
  → validates member + book → creates transaction → decrements copies_available

Return flow  (librarian calls after face + QR scan):
  POST /api/transactions/return  { user_id, book_id }
  → finds active loan → calculates fine → closes transaction → restores copies_available
  → if reservation is waiting for this book → marks it as "ready"
"""
from datetime import datetime, timedelta
from decimal import Decimal

from timezone_utils import PH_TZ, now_ph

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from config import LOAN_DAYS, FINE_PER_DAY
from database import get_db
from dependencies import get_current_user, require_librarian
from models.book import Book
from models.book_copy import BookCopy
from models.transaction import Transaction
from models.reservation import Reservation
from models.user import User
from models.notification import Notification
from services.loan_policy import assert_can_borrow, sync_overdue_loans
from services.book_copy_service import (
    assert_copy_can_borrow,
    ensure_book_copies,
    get_copy_or_404,
    select_available_copy,
)
from services.reservation_policy import (
    promote_next_pending_reservation,
    sync_expired_reservations,
)
from schemas.report import ReportRequest
from schemas.transaction import (
    BorrowRequest, ReturnRequest,
    TransactionOut, LoanOut, FinesSummary,
)

router = APIRouter(tags=["Transactions"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return now_ph()


def _calc_fine(due_date: datetime, return_date: datetime = None) -> Decimal:
    ref = return_date or _now()
    # Make both timezone-aware for comparison
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=PH_TZ)
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=PH_TZ)
    days_late = max(0, (ref - due_date).days)
    return Decimal(days_late * FINE_PER_DAY)


def _days_left(due_date: datetime) -> int:
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=PH_TZ)
    return (due_date - _now()).days


def _enrich(tx: Transaction) -> TransactionOut:
    out = TransactionOut.model_validate(tx)
    if tx.user:
        out.member_name = tx.user.name
        out.member_id   = tx.user.member_id or f"RPL-{tx.user.id:05d}"
    if tx.book:
        out.book_title = tx.book.title
        out.book_qr    = tx.book.qr_code
    if tx.copy:
        out.copy_id     = tx.copy.id
        out.copy_qr     = tx.copy.qr_code
        out.copy_number = tx.copy.copy_number
    return out


def _notify_next_reservation(book_id: int, db: Session):
    """If anyone is waiting for this book, mark their reservation as 'ready' and notify them."""
    promote_next_pending_reservation(db, book_id)


# ── Borrow ────────────────────────────────────────────────────────────────────

@router.post("/api/transactions/borrow", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def borrow_book(
    body: BorrowRequest,
    db:   Session = Depends(get_db),
    _:    User    = Depends(require_librarian),
):
    sync_expired_reservations(db)
    member = db.query(User).filter(User.id == body.user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.status == "suspended":
        raise HTTPException(status_code=403, detail="Member account is suspended")
    assert_can_borrow(db, body.user_id)

    book = db.query(Book).filter(Book.id == body.book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    ensure_book_copies(db, book.id)
    if book.copies_available < 1:
        raise HTTPException(status_code=409, detail="No copies available for borrowing")

    if body.copy_id is not None:
        selected_copy = get_copy_or_404(db, body.copy_id)
        if selected_copy.book_id != book.id:
            raise HTTPException(status_code=400, detail="Physical copy does not belong to this book")
    else:
        selected_copy = select_available_copy(db, book.id)
    if not selected_copy:
        raise HTTPException(status_code=409, detail="No physical copy is available for borrowing")
    assert_copy_can_borrow(selected_copy)

    # Check member doesn't already have this book borrowed
    already = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == body.user_id,
            Transaction.book_id == body.book_id,
            Transaction.status.in_(["active", "overdue"]),
        )
        .first()
    )
    if already:
        raise HTTPException(status_code=409, detail="Member already has this book borrowed")

    now      = _now()
    due_date = now + timedelta(days=LOAN_DAYS)

    tx = Transaction(
        user_id     = body.user_id,
        book_id     = body.book_id,
        copy_id     = selected_copy.id,
        type        = "borrow",
        status      = "active",
        borrow_date = now,
        due_date    = due_date,
        fine_amount = Decimal("0"),
    )
    db.add(tx)

    book.copies_available -= 1
    selected_copy.status = "borrowed"

    # If member had a reservation for this book, fulfil it
    reservation = (
        db.query(Reservation)
        .filter(
            Reservation.user_id == body.user_id,
            Reservation.book_id == body.book_id,
            Reservation.status.in_(["pending", "ready"]),
        )
        .first()
    )
    if reservation:
        reservation.status = "fulfilled"

    db.commit()
    db.refresh(tx)
    return _enrich(tx)


# ── Return ────────────────────────────────────────────────────────────────────

@router.post("/api/transactions/return", response_model=TransactionOut)
def return_book(
    body: ReturnRequest,
    db:   Session = Depends(get_db),
    _:    User    = Depends(require_librarian),
):
    sync_expired_reservations(db)
    sync_overdue_loans(db, user_id=body.user_id)
    ensure_book_copies(db, body.book_id)
    tx = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == body.user_id,
            Transaction.book_id == body.book_id,
            Transaction.status.in_(["active", "overdue"]),
        )
        .filter(Transaction.copy_id == body.copy_id if body.copy_id is not None else True)
        .first()
    )
    if not tx:
        raise HTTPException(
            status_code=404,
            detail="No active borrow record found for this member and book",
        )

    now            = _now()
    fine           = _calc_fine(tx.due_date, now)
    tx.return_date = now
    tx.fine_amount = fine
    tx.status      = "returned"
    tx.type        = "return"

    book = db.query(Book).filter(Book.id == body.book_id).first()
    if book:
        book.copies_available = min(book.copies_available + 1, book.copies_total)
        _notify_next_reservation(book.id, db)
    if tx.copy:
        tx.copy.status = "available"

    db.commit()
    db.refresh(tx)
    return _enrich(tx)


# ── Transaction history (librarian) ──────────────────────────────────────────

@router.get("/api/transactions", response_model=list[TransactionOut])
def get_transactions(
    type:    str = Query("", description="Filter: borrow | return"),
    status:  str = Query("", description="Filter: active | returned | overdue"),
    skip:    int = Query(0,  ge=0),
    limit:   int = Query(50, ge=1, le=200),
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    sync_overdue_loans(db)
    if type and type not in ("borrow", "return"):
        raise HTTPException(status_code=400, detail="Type filter must be 'borrow' or 'return'")
    if status and status not in ("active", "returned", "overdue"):
        raise HTTPException(status_code=400, detail="Status filter must be 'active', 'returned', or 'overdue'")

    q = db.query(Transaction)
    if type:
        q = q.filter(Transaction.type == type)
    if status:
        q = q.filter(Transaction.status == status)

    txs = q.order_by(desc(Transaction.borrow_date)).offset(skip).limit(limit).all()
    return [_enrich(tx) for tx in txs]


# ── Member: active loans ──────────────────────────────────────────────────────

@router.get("/api/user/loans", response_model=list[LoanOut])
def my_loans(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    sync_overdue_loans(db, user_id=current_user.id)
    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id, Transaction.status.in_(["active", "overdue"]))
        .order_by(Transaction.due_date)
        .all()
    )

    loans = []
    for tx in txs:
        fine = _calc_fine(tx.due_date)
        loans.append(LoanOut(
            transaction_id = tx.id,
            book_id        = tx.book_id,
            book_title     = tx.book.title  if tx.book else "Unknown",
            book_author    = tx.book.author if tx.book else "",
            cover_url      = tx.book.cover_url if tx.book else None,
            borrow_date    = tx.borrow_date,
            due_date       = tx.due_date,
            days_left      = _days_left(tx.due_date),
            fine_amount    = fine,
        ))
    return loans


# ── Member: fines summary ─────────────────────────────────────────────────────

@router.get("/api/user/fines", response_model=FinesSummary)
def my_fines(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    sync_overdue_loans(db, user_id=current_user.id)
    overdue_txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.status  == "overdue",
        )
        .all()
    )

    overdue_loans = []
    total = Decimal("0")

    for tx in overdue_txs:
        fine = _calc_fine(tx.due_date)
        total += fine
        overdue_loans.append(LoanOut(
            transaction_id = tx.id,
            book_id        = tx.book_id,
            book_title     = tx.book.title  if tx.book else "Unknown",
            book_author    = tx.book.author if tx.book else "",
            cover_url      = tx.book.cover_url if tx.book else None,
            borrow_date    = tx.borrow_date,
            due_date       = tx.due_date,
            days_left      = _days_left(tx.due_date),
            fine_amount    = fine,
        ))

    return FinesSummary(total_fine=total, overdue_loans=overdue_loans)


# ── Member: report a loan issue ───────────────────────────────────────────────

@router.post("/api/transactions/{transaction_id}/report")
def report_loan(
    transaction_id: int,
    body:           ReportRequest,
    current_user:   User    = Depends(get_current_user),
    db:             Session = Depends(get_db),
):
    sync_overdue_loans(db, user_id=current_user.id)
    tx = (
        db.query(Transaction)
        .filter(
            Transaction.id      == transaction_id,
            Transaction.user_id == current_user.id,
            Transaction.status.in_(["active", "overdue"]),
        )
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Active loan not found")

    REASON_LABELS = {
        "damaged":    "Book is damaged",
        "wrong_book": "Wrong book issued",
        "lost":       "Book is lost",
        "other":      "Other issue",
    }
    reason_label = REASON_LABELS.get(body.reason, body.reason)
    book_title   = tx.book.title if tx.book else "Unknown"
    note_part    = f" — Note: {body.note}" if body.note else ""

    notif = Notification(
        message     = f"[REPORT] {current_user.name} reported \"{book_title}\": {reason_label}{note_part}",
        type        = "report",
        member_name = current_user.name,
        book_title  = book_title,
    )
    db.add(notif)
    db.commit()
    return {"success": True, "message": "Report submitted to librarian."}
