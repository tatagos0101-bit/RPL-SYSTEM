"""
PDF report endpoints.

  GET /api/reports/transcript        → member downloads their reading history as PDF
  GET /api/reports/monthly?month=3&year=2026 → librarian downloads categorized monthly library PDF
"""
from datetime import datetime

from timezone_utils import PH_TZ, now_ph

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from dependencies import get_current_user, require_librarian
from limiter import limiter
from models.transaction import Transaction
from models.user import User
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
    from services.monthly_report import monthly_data
    from services.report_service import build_monthly_report
    from services.report_snapshot import snapshot

    with snapshot(db) as reader:
        report = monthly_data(reader, month, year)
    pdf_bytes = build_monthly_report(report)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=RPL-Monthly-{year}-{month:02d}.pdf",
        "Cache-Control": "no-store",
    })
