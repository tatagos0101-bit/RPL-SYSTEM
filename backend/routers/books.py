"""
Public book endpoints — accessible by everyone (no auth required).
"""
from datetime import datetime, timedelta
from typing import Literal

from timezone_utils import now_ph
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import get_db
from limiter import limiter
from models.book import Book
from models.transaction import Transaction
from schemas.book import BookOut, BookListResponse, BookScanOut
from services.book_copy_service import normalize_scan_code, resolve_scan
from services.catalog_discovery import order_catalog, category_cover_previews
from config import LOAN_DAYS, FINE_PER_DAY, PICKUP_WINDOW_HOURS
from services.borrowing_capacity import COMMITMENT_LIMIT

router = APIRouter(prefix="/api/books", tags=["Books"])


@router.get("/policy")
def loan_policy():
    return {"loan_days": LOAN_DAYS, "preview_due_date": (now_ph() + timedelta(days=LOAN_DAYS)).isoformat(), "fine_per_day": FINE_PER_DAY,
            "pickup_window_hours": PICKUP_WINDOW_HOURS, "commitment_limit": COMMITMENT_LIMIT}


# ── All books — search + filter + paginate ────────────────────────────────────

@router.get("", response_model=BookListResponse)
@limiter.limit("60/minute")
def list_books(
    request:        Request,
    search:         str  = Query("", max_length=200, description="Search title or author"),
    category:       str  = Query("", max_length=100, description="Filter by category"),
    available_only: bool = Query(False, description="Only show books with copies available"),
    sort: Literal["title", "trending", "newest", "loved"] = Query("title", description="Catalog ordering"),
    favorites_only: bool = Query(False, description="Only books favorited by active members"),
    skip:           int  = Query(0,  ge=0),
    limit:          int  = Query(20, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    q = db.query(Book)

    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{escaped}%"
        q = q.filter(
            Book.title.ilike(like, escape="\\") | Book.author.ilike(like, escape="\\")
        )
    if category:
        q = q.filter(Book.category.ilike(category))
    if available_only:
        q = q.filter(Book.copies_available > 0, Book.is_borrowable.is_(True))

    q = order_catalog(q, sort, favorites_only, now=now_ph())
    total = q.order_by(None).count()
    items = q.offset(skip).limit(limit).all()

    return BookListResponse(total=total, skip=skip, limit=limit, items=items)


# ── Categories list ───────────────────────────────────────────────────────────

@router.get("/categories")
@limiter.limit("30/minute")
def get_categories(request: Request, db: Session = Depends(get_db), include_previews: bool = False):
    rows = (
        db.query(Book.category, func.count(Book.id).label("count"))
        .filter((Book.is_hidden == False) | (Book.category == "General"))
        .group_by(Book.category)
        .order_by(desc("count"))
        .all()
    )
    result = [{"category": r.category, "count": r.count} for r in rows]
    if include_previews:
        previews = category_cover_previews(db, [row.category for row in rows])
        for item in result:
            item["preview_covers"] = previews[item["category"]]
    return result


# ── Trending — most borrowed in last 30 days ──────────────────────────────────

@router.get("/trending", response_model=list[BookOut])
@limiter.limit("30/minute")
def trending_books(request: Request, limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    since = now_ph() - timedelta(days=30)

    top_ids = (
        db.query(Transaction.book_id, func.count(Transaction.id).label("borrows"))
        .filter(Transaction.borrow_date >= since)
        .group_by(Transaction.book_id)
        .order_by(desc("borrows"))
        .limit(limit)
        .all()
    )

    # Preserve ranking order
    id_list = [r.book_id for r in top_ids]
    if not id_list:
        # Fallback: newest books when no borrow history yet
        return db.query(Book).order_by(desc(Book.created_at)).limit(limit).all()

    books = {b.id: b for b in db.query(Book).filter(Book.id.in_(id_list)).all()}
    return [books[i] for i in id_list if i in books]


# ── QR lookup — used by borrow/return modal ───────────────────────────────────

@router.get("/qr/{qr_code}", response_model=BookOut)
@limiter.limit("60/minute")
def get_book_by_qr(request: Request, qr_code: str, db: Session = Depends(get_db)):
    code = normalize_scan_code(qr_code)
    _, book, _, _, _ = resolve_scan(db, code)
    return book


@router.get("/scan/{code}", response_model=BookScanOut)
@limiter.limit("60/minute")
def scan_book_code(request: Request, code: str, db: Session = Depends(get_db)):
    qr_type, book, copy, can_borrow, message = resolve_scan(db, code)
    return BookScanOut(
        qr_type=qr_type,
        book=book,
        copy=copy,
        can_borrow=can_borrow,
        message=message,
    )


# ── Single book ───────────────────────────────────────────────────────────────

@router.get("/{book_id}", response_model=BookOut)
@limiter.limit("60/minute")
def get_book(request: Request, book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book
