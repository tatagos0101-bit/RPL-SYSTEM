"""
Inventory endpoints — librarian only.
CRUD for books + Excel bulk upload + QR generation.
"""
import os
import uuid
import logging
import hashlib
import re
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Header, status
from fastapi.responses import Response, StreamingResponse
from io import BytesIO
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field

from database import get_db
from dependencies import require_librarian
from models.book import Book
from models.book_copy import BookCopy
from models.user import User
from models.transaction import Transaction
from models.reservation import Reservation
from services.reservation_policy import sync_expired_reservations, promote_next_pending_reservation
from schemas.book import BookCreate, BookUpdate, BookOut, BookCopyLabelOut, BulkUploadResponse, InventoryStats
from services.category_service import assign_category, category_write_lock, reconcile_categories, MASTER_KEYWORDS, mapped_parent
from services.qr_service import make_qr_code, generate_qr_png, generate_bulk_pdf
from services.book_copy_service import copy_label_payload, ensure_book_copies, get_copy_or_404, resize_book_copies
from services.storage_service import save_upload, delete_upload
from services.cloud_uploads import read_upload
from services.inventory_writes import find_write, remember_write, fingerprint

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_COVER_SIZE   = 5 * 1024 * 1024   # 5 MB
MAX_EXCEL_SIZE   = 10 * 1024 * 1024  # 10 MB

# Magic bytes for common image formats
_MAGIC = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG":      "image/png",
    b"RIFF":         "image/webp",   # WebP starts RIFF....WEBP
    b"GIF8":         "image/gif",
}

router = APIRouter(prefix="/api/inventory", tags=["Inventory"])


def _clean_replaced_cover(db, previous, current):
    if previous and previous != current and not db.query(Book.id).filter(Book.cover_url == previous).first():
        try:
            delete_upload(previous, folder="covers")
        except HTTPException:
            logging.getLogger(__name__).warning("Replaced cover cleanup failed")


# ── Inventory stats ───────────────────────────────────────────────────────────

@router.get("/stats", response_model=InventoryStats)
def inventory_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_librarian),
):
    total_titles     = db.query(func.count(Book.id)).scalar()
    total_copies     = db.query(func.sum(Book.copies_total)).scalar()     or 0
    available_copies = db.query(func.sum(Book.copies_available)).scalar() or 0
    borrowed_copies  = db.query(Transaction).filter(Transaction.status.in_(['active', 'overdue'])).count()
    categories       = db.query(func.count(Book.category.distinct())).scalar()

    return InventoryStats(
        total_titles=total_titles,
        total_copies=total_copies,
        available_copies=available_copies,
        borrowed_copies=borrowed_copies,
        categories=categories,
    )


# ── Add single book ───────────────────────────────────────────────────────────

@router.post("/books", response_model=BookOut, status_code=status.HTTP_201_CREATED)
def add_book(
    body: BookCreate,
    db:   Session = Depends(get_db),
    _:    User    = Depends(require_librarian),
    request_id: Annotated[UUID | None, Header(alias="Idempotency-Key")] = None,
):
    category_write_lock(db)
    digest = fingerprint(body.model_dump(mode="json"))
    saved = find_write(db, _.id, request_id, "create-book", digest)
    if saved:
        return saved.result
    if body.isbn:
        if db.query(Book).filter(Book.isbn == body.isbn).first():
            raise HTTPException(status_code=400, detail=f"ISBN '{body.isbn}' already exists")

    book = Book(
        **body.model_dump(),
        copies_available=body.copies_total,
    )
    assign_category(book, body.category)
    db.add(book)
    db.flush()   # get the auto-increment ID before commit

    book.qr_code = make_qr_code(book.id)
    ensure_book_copies(db, book.id, commit=False)
    db.flush()
    reconcile_categories(db)
    remember_write(db, _.id, request_id, "create-book", digest,
                   BookOut.model_validate(book).model_dump(mode="json"))
    db.commit()
    db.refresh(book)
    return book


@router.get("/write-requests/{request_id}")
def inventory_write_status(request_id: UUID, db: Session = Depends(get_db),
                           _: User = Depends(require_librarian)):
    saved = find_write(db, _.id, request_id)
    if saved is None:
        raise HTTPException(404, "No committed outcome for this request. Retry only with the same request ID.")
    return {"operation": saved.operation, "result": saved.result}


# ── Update book ───────────────────────────────────────────────────────────────

@router.put("/books/{book_id}", response_model=BookOut)
def update_book(
    book_id: int,
    body:    BookUpdate,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    category_write_lock(db)
    book = db.query(Book).filter(Book.id == book_id).with_for_update().first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    changes = body.model_dump(exclude_unset=True)
    previous_cover = book.cover_url
    sync_expired_reservations(db, book_id=book_id, commit=False)
    for required in ("title", "author", "category", "copies_total"):
        if required in changes and changes[required] is None:
            raise HTTPException(422, f"{required.replace('_', ' ').capitalize()} cannot be empty.")
    if changes.get("isbn") and db.query(Book.id).filter(Book.isbn == changes["isbn"], Book.id != book_id).first():
        raise HTTPException(409, "This ISBN is already assigned to another book.")

    resize_book_copies(db, book, changes.get("copies_total", book.copies_total))
    held = db.query(Reservation).filter(Reservation.book_id == book.id, Reservation.status == 'ready').count()
    if book.copies_available < held:
        raise HTTPException(409, 'Cannot reduce available stock below ready reservation holds.')
    promote_next_pending_reservation(db, book_id)
    if "copies_available" in changes and changes["copies_available"] != book.copies_available:
        raise HTTPException(422, "Available copies are calculated from physical copies and active loans.")
    category_changed = "category" in changes and changes["category"] != book.category
    for field, value in changes.items():
        if field not in {"copies_total", "copies_available", "category"}:
            setattr(book, field, value)

    if category_changed:
        assign_category(book, changes["category"])
        reconcile_categories(db)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Book details conflict with another record. Refresh and try again.") from None
    db.refresh(book)
    _clean_replaced_cover(db, previous_cover, book.cover_url)
    return book


# ── Delete book ───────────────────────────────────────────────────────────────

@router.delete("/books/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(
    book_id: int,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    category_write_lock(db)
    book = db.query(Book).filter(Book.id == book_id).with_for_update().first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if (db.query(Transaction.id).filter(Transaction.book_id == book_id).first()
            or db.query(Reservation.id).filter(Reservation.book_id == book_id).first()):
        raise HTTPException(409, 'Titles with loan or reservation history cannot be deleted.')
    db.delete(book)
    reconcile_categories(db)
    db.commit()


# ── Upload cover image ────────────────────────────────────────────────────────

@router.post("/books/{book_id}/cover", response_model=BookOut)
async def upload_cover(
    book_id: int,
    file: UploadFile | None = File(None, description="Cover image (JPEG, PNG, WebP, or GIF)"),
    upload_ticket: str | None = Form(None),
    db:   Session    = Depends(get_db),
    _:    User       = Depends(require_librarian),
):
    book = db.query(Book).filter(Book.id == book_id).with_for_update().populate_existing().first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if file and file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, or GIF images are accepted")

    contents, original_filename, reference = await read_upload(folder="covers", user_id=_.id, file=file, ticket=upload_ticket)

    if len(contents) > MAX_COVER_SIZE:
        raise HTTPException(status_code=413, detail="Image file too large (max 5 MB)")

    # Validate magic bytes — prevents MIME-type spoofing
    detected = None
    for magic, mime in _MAGIC.items():
        if contents[:len(magic)] == magic:
            detected = mime
            break
    if detected is None:
        raise HTTPException(status_code=400, detail="File contents do not match a supported image format")
    # WebP extra check: bytes 8-12 must be b"WEBP"
    if detected == "image/webp" and contents[8:12] != b"WEBP":
        raise HTTPException(status_code=400, detail="File contents do not match a supported image format")

    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = "." + (detected.split("/")[-1].replace("jpeg", "jpg"))

    filename = f"{book_id}_{uuid.uuid4().hex[:8]}{ext}"
    previous_cover = book.cover_url
    book.cover_url = reference or save_upload("covers", filename, contents)
    db.commit()
    db.refresh(book)
    _clean_replaced_cover(db, previous_cover, book.cover_url)
    return book


# ── Excel bulk upload ─────────────────────────────────────────────────────────

@router.post("/bulk-upload", response_model=BulkUploadResponse)
async def bulk_upload(
    file: UploadFile | None = File(None, description="Excel .xlsx file"),
    upload_ticket: str | None = Form(None),
    db:   Session    = Depends(get_db),
    _:    User       = Depends(require_librarian),
    request_id: Annotated[UUID | None, Header(alias="Idempotency-Key")] = None,
    content_sha256: Annotated[str | None, Header(alias="X-Content-SHA256")] = None,
):
    if request_id is not None and not re.fullmatch(r"[0-9a-f]{64}", content_sha256 or ""):
        raise HTTPException(422, "A SHA-256 workbook fingerprint is required for retryable imports.")
    saved = find_write(db, _.id, request_id, "import-workbook", content_sha256)
    if saved:
        return saved.result
    raw, original_filename, reference = await read_upload(folder="imports", user_id=_.id, file=file, ticket=upload_ticket)
    if request_id is not None and hashlib.sha256(raw).hexdigest() != content_sha256:
        raise HTTPException(409, "The workbook differs from this import request. Reselect the original file.")
    ext = os.path.splitext(original_filename)[1].lower()
    if ext != ".xlsx":
        raise HTTPException(status_code=400, detail="Full inventory import requires .xlsx. Convert legacy .xls workbooks to .xlsx first.")

    from services.excel_service import parse_excel

    if len(raw) > MAX_EXCEL_SIZE:
        raise HTTPException(status_code=413, detail="Excel file too large (max 10 MB)")

    # Validate magic bytes: .xlsx is a ZIP (PK\x03\x04), .xls is OLE2 (\xd0\xcf\x11\xe0)
    if not (raw[:4] == b"PK\x03\x04" or raw[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        raise HTTPException(status_code=400, detail="File contents do not match a valid Excel format")
    try:
        rows = parse_excel(raw)
    except Exception:
        raise HTTPException(status_code=422, detail="Unable to read this workbook. Check its format and column headers.") from None

    category_write_lock(db)
    added   = 0
    skipped = 0
    errors  = []

    for row in rows:
        i = row.pop("_row_number")
        try:
            validated = BookCreate.model_validate(row).model_dump()
            # Skip duplicate ISBNs
            if validated.get("isbn") and db.query(Book).filter(Book.isbn == validated["isbn"]).first():
                skipped += 1
                continue

            with db.begin_nested():
                book = Book(**validated, copies_available=validated["copies_total"])
                assign_category(book, validated["category"])
                db.add(book)
                db.flush()
                book.qr_code = make_qr_code(book.id)
                ensure_book_copies(db, book.id, commit=False)
            added += 1

        except Exception:
            errors.append(f"Row {i}: Unable to import. Check the values and required fields.")
            continue

    reconcile_categories(db)
    result = BulkUploadResponse(added=added, skipped=skipped, errors=errors,
        message=f"{added} books imported, {skipped} skipped (duplicate ISBN), {len(errors)} errors")
    remember_write(db, _.id, request_id, "import-workbook", content_sha256, result.model_dump())
    db.commit()

    if reference:
        try:
            delete_upload(reference, folder="imports")
        except HTTPException:
            pass  # The successful database import must not depend on cleanup.

    return result


# ── Generate single QR PNG ────────────────────────────────────────────────────

@router.get("/books/{book_id}/qr")
def get_qr_image(
    book_id: int,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    ensure_book_copies(db, book.id)
    copy = (
        db.query(BookCopy)
        .filter(BookCopy.book_id == book.id)
        .order_by(BookCopy.copy_number)
        .first()
    )
    qr_string = copy.qr_code if copy else (book.qr_code or make_qr_code(book.id))
    png_bytes  = generate_qr_png(qr_string)

    return Response(content=png_bytes, media_type="image/png")


def _copy_query(db, search):
    q = db.query(BookCopy).join(Book)
    if search:
        like = f"%{search}%"
        q = q.filter(Book.title.ilike(like) | Book.author.ilike(like) | BookCopy.qr_code.ilike(like))
    return q


@router.get("/book-copies", response_model=list[BookCopyLabelOut])
def list_book_copies(search: str = Query("", max_length=200),
                     skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=10000),
                     db: Session = Depends(get_db), _: User = Depends(require_librarian)):
    ensure_book_copies(db)
    copies = (_copy_query(db, search).options(joinedload(BookCopy.book))
              .order_by(Book.title, Book.id, BookCopy.copy_number, BookCopy.id)
              .offset(skip).limit(limit).all())
    return [copy_label_payload(copy) for copy in copies]


@router.get("/book-copies/count")
def count_book_copies(search: str = Query("", max_length=200),
                      db: Session = Depends(get_db), _: User = Depends(require_librarian)):
    ensure_book_copies(db)
    return {"total": _copy_query(db, search).count()}


@router.get("/book-copies/export")
def export_copy_qrs(search: str = Query("", max_length=200),
                    db: Session = Depends(get_db), _: User = Depends(require_librarian)):
    ensure_book_copies(db)
    # Capture the complete matching identity set once. Never cap an all export.
    ids = [row[0] for row in _copy_query(db, search).with_entities(BookCopy.id).order_by(BookCopy.id).all()]
    if not ids:
        raise HTTPException(404, "No matching physical copies to export.")
    # The browser fetches bounded PDFs for this identity snapshot. Generating
    # all labels in one serverless invocation can exceed its execution limit.
    return {"copy_ids": ids, "total": len(ids)}


@router.get("/book-copies/{copy_id}/qr")
def get_copy_qr_image(
    copy_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_librarian),
):
    copy = get_copy_or_404(db, copy_id)
    return Response(content=generate_qr_png(copy.qr_code), media_type="image/png")


@router.post("/book-copies/qr-pdf")
def bulk_copy_qr_pdf(
    copy_ids: list[int],
    db: Session = Depends(get_db),
    _: User = Depends(require_librarian),
):
    if not copy_ids:
        raise HTTPException(400, "Select at least one physical copy. Use the explicit all-matching export for all copies.")
    if len(set(copy_ids)) > 1000:
        raise HTTPException(422, "Select at most 1,000 copies per PDF, or use the all-matching ZIP export.")
    ensure_book_copies(db)
    copies = (db.query(BookCopy).options(joinedload(BookCopy.book))
              .filter(BookCopy.id.in_(copy_ids)).order_by(BookCopy.book_id, BookCopy.copy_number).all())
    if len(copies) != len(set(copy_ids)):
        raise HTTPException(409, "Some selected copies no longer exist. Refresh the selection.")
    if not copies:
        raise HTTPException(status_code=404, detail="No physical copies found for given IDs")

    pdf_bytes = generate_bulk_pdf(copies)
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=copy-qr-codes.pdf"},
    )


# ── Generate bulk QR PDF (for LibQRBulk print page) ──────────────────────────

@router.post("/books/qr-pdf")
def bulk_qr_pdf(
    book_ids: list[int],
    db:       Session = Depends(get_db),
    _:        User    = Depends(require_librarian),
):
    if not book_ids:
        raise HTTPException(status_code=400, detail="No book IDs provided")

    ensure_book_copies(db)
    books = db.query(Book).filter(Book.id.in_(book_ids)).all()
    if not books:
        raise HTTPException(status_code=404, detail="No books found for given IDs")

    pdf_bytes = generate_bulk_pdf(books)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=qr-codes.pdf"},
    )


@router.get("/category-review")
def category_review(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_librarian),
):
    rows = (db.query(Book.raw_api_label, func.count(Book.id).label("book_count"))
            .filter(Book.is_hidden == True, Book.raw_api_label.isnot(None))
            .group_by(Book.raw_api_label).order_by(Book.raw_api_label)
            .offset(skip).limit(limit).all())
    return [{"raw_api_label": row.raw_api_label, "book_count": row.book_count,
             "is_hidden": True} for row in rows]


@router.get("/category-masters")
def category_masters(_: User = Depends(require_librarian)):
    return ["General", *MASTER_KEYWORDS]


class CategorySuggestionRequest(BaseModel):
    labels: list[Annotated[str, Field(max_length=1000)]] = Field(max_length=100)


@router.post("/category-suggestion")
def category_suggestion(body: CategorySuggestionRequest, _: User = Depends(require_librarian)):
    labels = [label.strip() for label in body.labels if label.strip()]
    # Prefer a specific mapped label over a generic Fiction/General tag.
    raw = next((label for label in labels if mapped_parent(label) not in (None, "General")),
               next((label for label in labels if mapped_parent(label) is None), "General"))
    parent = mapped_parent(raw)
    return {"raw_api_label": raw, "mapped_category": parent or "General", "is_hidden": parent is None}


class CategoryReviewResolution(BaseModel):
    raw_api_label: str = Field(min_length=1, max_length=1000)
    master_category: str = Field(max_length=80)


@router.post("/category-review/resolve")
def resolve_category_review(
    body: CategoryReviewResolution,
    db: Session = Depends(get_db),
    _: User = Depends(require_librarian),
):
    if body.master_category not in {"General", *MASTER_KEYWORDS}:
        raise HTTPException(422, "Choose an existing master category.")
    category_write_lock(db)
    # Python equality keeps exact-label semantics even on case-insensitive DB collations.
    books = [book for book in db.query(Book).filter(Book.is_hidden == True).all()
             if book.raw_api_label == body.raw_api_label]
    for book in books:
        book.category_override = body.master_category
        book.category = body.master_category
        book.is_hidden = False
    db.commit()
    return {"updated": len(books)}
