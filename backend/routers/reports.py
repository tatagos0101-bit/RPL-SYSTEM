"""
PDF report endpoints.

  GET /api/reports/transcript        → member downloads their reading history as PDF
  GET /api/reports/monthly?month=3&year=2026 → librarian downloads monthly circulation PDF
"""
from datetime import datetime, timedelta

from timezone_utils import PH_TZ, now_ph

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_

from database import get_db
from dependencies import get_current_user, require_librarian
from limiter import limiter
from models.entry_log import EntryLog
from models.transaction import Transaction
from models.user import User
from models.book import Book
from services.loan_policy import sync_overdue_loans

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def _now() -> datetime:
    return now_ph()


# ── Member Reading Transcript (PDF) ──────────────────────────────────────────

@router.get("/transcript")
@limiter.limit("5/minute")
def download_transcript(
    request:      Request,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    sync_overdue_loans(db, user_id=current_user.id)
    from services.report_service import build_transcript

    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .order_by(desc(Transaction.borrow_date))
        .all()
    )

    pdf_bytes = build_transcript(user=current_user, transactions=transactions)
    filename  = f"RPL-Transcript-{current_user.id:05d}.pdf"

    return Response(
        content     = pdf_bytes,
        media_type  = "application/pdf",
        headers     = {"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Monthly Circulation Report (PDF) — librarian only ────────────────────────

@router.get("/monthly")
@limiter.limit("5/minute")
def monthly_report(
    request: Request,
    month: int = Query(..., ge=1, le=12, description="Month number 1-12"),
    year:  int = Query(..., ge=2020, le=9998, description="4-digit year"),
    db:    Session = Depends(get_db),
    _:     User    = Depends(require_librarian),
):
    sync_overdue_loans(db)
    from services.report_service import build_monthly_report

    # Date range for the requested month — boundaries at Philippines midnight
    start = datetime(year, month, 1, tzinfo=PH_TZ)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=PH_TZ)
    else:
        end = datetime(year, month + 1, 1, tzinfo=PH_TZ)

    # KPI stats
    borrows = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.borrow_date >= start, Transaction.borrow_date < end)
        .scalar()
    )
    returns = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.type == "return", Transaction.return_date >= start, Transaction.return_date < end)
        .scalar()
    )
    active_members = (
        db.query(func.count(Transaction.user_id.distinct()))
        .filter(or_(
            (Transaction.borrow_date >= start) & (Transaction.borrow_date < end),
            (Transaction.return_date >= start) & (Transaction.return_date < end),
        ))
        .scalar()
    )
    new_members = (
        db.query(func.count(User.id))
        .filter(User.role == "member", User.created_at >= start, User.created_at < end)
        .scalar()
    )
    overdue = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.status == "overdue")
        .scalar()
    )
    fines_collected = (
        db.query(func.sum(Transaction.fine_amount))
        .filter(Transaction.return_date >= start, Transaction.return_date < end)
        .scalar()
    ) or 0
    visits = (
        db.query(func.count(EntryLog.id))
        .filter(EntryLog.accessed_at >= start, EntryLog.accessed_at < end, EntryLog.granted == True)
        .scalar()
    )
    denied_visits = (
        db.query(func.count(EntryLog.id))
        .filter(EntryLog.accessed_at >= start, EntryLog.accessed_at < end, EntryLog.granted == False)
        .scalar()
    )
    book_titles = db.query(func.count(Book.id)).scalar() or 0
    total_copies = db.query(func.sum(Book.copies_total)).scalar() or 0
    available_copies = db.query(func.sum(Book.copies_available)).scalar() or 0
    borrowed_copies = db.query(func.count(Transaction.id)).filter(
        Transaction.status.in_(["active", "overdue"]),
    ).scalar() or 0

    stats = {
        "borrows":     borrows,
        "returns":     returns,
        "members":     active_members,
        "new_members": new_members,
        "overdue":     overdue,
        "fines":       float(fines_collected),
        "visits":      visits,
        "denied_visits": denied_visits,
        "book_titles": int(book_titles),
        "total_copies": int(total_copies),
        "available_copies": int(available_copies),
        "borrowed_copies": borrowed_copies,
    }

    # Top 10 borrowed books this month
    top_book_rows = (
        db.query(Transaction.book_id, func.count(Transaction.id).label("cnt"))
        .filter(Transaction.borrow_date >= start, Transaction.borrow_date < end)
        .group_by(Transaction.book_id)
        .order_by(desc("cnt"))
        .limit(10)
        .all()
    )
    top_books = []
    for row in top_book_rows:
        b = db.query(Book).filter(Book.id == row.book_id).first()
        if b:
            top_books.append({
                "title":    b.title,
                "author":   b.author,
                "category": b.category,
                "borrows":  row.cnt,
            })

    # Top 10 most active members this month
    top_member_rows = (
        db.query(Transaction.user_id, func.count(Transaction.id).label("cnt"))
        .filter(Transaction.borrow_date >= start, Transaction.borrow_date < end)
        .group_by(Transaction.user_id)
        .order_by(desc("cnt"))
        .limit(10)
        .all()
    )
    top_members = []
    for row in top_member_rows:
        u = db.query(User).filter(User.id == row.user_id).first()
        if u:
            top_members.append({
                "member_id": u.member_id or f"RPL-{u.id:05d}",
                "name":      u.name,
                "borrows":   row.cnt,
            })

    month_label = start.strftime("%B %Y")
    pdf_bytes   = build_monthly_report(month_label, stats, top_books, top_members)
    filename    = f"RPL-Monthly-{year}-{month:02d}.pdf"

    return Response(
        content    = pdf_bytes,
        media_type = "application/pdf",
        headers    = {"Content-Disposition": f"attachment; filename={filename}"},
    )
