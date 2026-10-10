"""
Inventory endpoints — librarian only.
CRUD for books + Excel bulk upload + QR generation.
"""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import Response, StreamingResponse
from io import BytesIO
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from dependencies import require_librarian
from models.book import Book
from models.book_copy import BookCopy
from models.user import User
from schemas.book import BookCreate, BookUpdate, BookOut, BookCopyLabelOut, BulkUploadResponse, InventoryStats
from services.qr_service import make_qr_code, generate_qr_png, generate_bulk_pdf
from services.book_copy_service import copy_label_payload, ensure_book_copies, get_copy_or_404
from services.storage_service import save_upload, delete_upload
from services.cloud_uploads import read_upload

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


# ── Inventory stats ───────────────────────────────────────────────────────────

@router.get("/stats", response_model=InventoryStats)
def inventory_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_librarian),
):
    total_titles     = db.query(func.count(Book.id)).scalar()
    total_copies     = db.query(func.sum(Book.copies_total)).scalar()     or 0
    available_copies = db.query(func.sum(Book.copies_available)).scalar() or 0
    borrowed_copies  = total_copies - available_copies
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
):
    if body.isbn:
        if db.query(Book).filter(Book.isbn == body.isbn).first():
            raise HTTPException(status_code=400, detail=f"ISBN '{body.isbn}' already exists")

    book = Book(
        **body.model_dump(),
        copies_available=body.copies_total,
    )
    db.add(book)
    db.flush()   # get the auto-increment ID before commit

    book.qr_code = make_qr_code(book.id)
    db.commit()
    ensure_book_copies(db, book.id)
    db.refresh(book)
    return book


# ── Update book ───────────────────────────────────────────────────────────────

@router.put("/books/{book_id}", response_model=BookOut)
def update_book(
    book_id: int,
    body:    BookUpdate,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(book, field, value)

    db.commit()
    ensure_book_copies(db, book.id)
    db.refresh(book)
    return book


# ── Delete book ───────────────────────────────────────────────────────────────

@router.delete("/books/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(
    book_id: int,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_librarian),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    db.delete(book)
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
    book = db.query(Book).filter(Book.id == book_id).first()
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
    book.cover_url = reference or save_upload("covers", filename, contents)
    db.commit()
    db.refresh(book)
    return book


# ── Excel bulk upload ─────────────────────────────────────────────────────────

@router.post("/bulk-upload", response_model=BulkUploadResponse)
async def bulk_upload(
    file: UploadFile | None = File(None, description="Excel .xlsx file"),
    upload_ticket: str | None = Form(None),
    db:   Session    = Depends(get_db),
    _:    User       = Depends(require_librarian),
):
    raw, original_filename, reference = await read_upload(folder="imports", user_id=_.id, file=file, ticket=upload_ticket)
    ext = os.path.splitext(original_filename)[1].lower()
    if ext not in (".xlsx", ".xls"):
        raise HTTPException(status_code=400, detail="Only .xlsx or .xls files are accepted")

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

    added   = 0
    skipped = 0
    errors  = []

    for i, row in enumerate(rows, start=2):   # start=2 because row 1 is headers
        try:
            # Skip duplicate ISBNs
            if row.get("isbn") and db.query(Book).filter(Book.isbn == row["isbn"]).first():
                skipped += 1
                continue

            book = Book(**row)
            db.add(book)
            db.flush()
            book.qr_code = make_qr_code(book.id)
            added += 1

        except Exception:
            db.rollback()
            errors.append(f"Row {i}: Unable to import. Check the values and required fields.")
            continue

    db.commit()
    ensure_book_copies(db)

    if reference:
        try:
            delete_upload(reference, folder="imports")
        except HTTPException:
            pass  # The successful database import must not depend on cleanup.

    return BulkUploadResponse(
        added=added,
        skipped=skipped,
        errors=errors,
        message=f"{added} books imported, {skipped} skipped (duplicate ISBN), {len(errors)} errors",
    )


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


@router.get("/book-copies", response_model=list[BookCopyLabelOut])
def list_book_copies(
    search: str = Query("", max_length=200),
    skip: int = Query(0, ge=0),
    limit: int = Query(5000, ge=1, le=10000),
    db: Session = Depends(get_db),
    _: User = Depends(require_librarian),
):
    ensure_book_copies(db)
    q = db.query(BookCopy).join(Book)
    if search:
        like = f"%{search}%"
        q = q.filter(
            Book.title.ilike(like) |
            Book.author.ilike(like) |
            BookCopy.qr_code.ilike(like)
        )
    copies = (
        q.order_by(Book.title, BookCopy.copy_number)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [copy_label_payload(copy) for copy in copies]


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
    ensure_book_copies(db)
    q = db.query(BookCopy)
    if copy_ids:
        q = q.filter(BookCopy.id.in_(copy_ids))
    copies = q.order_by(BookCopy.book_id, BookCopy.copy_number).all()
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
