import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.book import Book
from models.book_copy import BookCopy
from models.transaction import Transaction

COPY_STATUSES = {"available", "borrowed", "damaged", "lost", "retired"}
UNBORROWABLE_COPY_MESSAGES = {
    "borrowed": "This physical copy is already borrowed.",
    "damaged": "This physical copy is damaged and cannot be borrowed.",
    "lost": "This physical copy is lost and cannot be borrowed.",
    "retired": "This physical copy is retired and cannot be borrowed.",
}
_QR_RE = re.compile(r"^[A-Z0-9\-]{1,60}$")


def make_copy_qr_code(book_id: int, copy_number: int) -> str:
    return f"RPL-BOOK-{book_id:05d}-C{copy_number:03d}"


def normalize_scan_code(code: str) -> str:
    normalized = "".join((code or "").split()).upper()
    if not normalized or not _QR_RE.match(normalized):
        raise HTTPException(status_code=400, detail="Invalid QR code format")
    return normalized


def _sync_book_available_count(book: Book) -> None:
    book.copies_available = sum(1 for copy in book.copies if copy.status == "available")


def ensure_book_copies(db: Session, book_id: int | None = None, *, commit: bool = True) -> int:
    query = db.query(Book)
    if book_id is not None:
        query = query.filter(Book.id == book_id)

    changed = 0
    for book in query.all():
        existing_by_number = {copy.copy_number: copy for copy in book.copies}
        for copy_number in range(1, int(book.copies_total or 0) + 1):
            if copy_number in existing_by_number:
                copy = existing_by_number[copy_number]
                expected_qr = make_copy_qr_code(book.id, copy_number)
                if copy.qr_code != expected_qr:
                    copy.qr_code = expected_qr
                    changed += 1
                if copy.status not in COPY_STATUSES:
                    copy.status = "available"
                    changed += 1
                continue

            db.add(BookCopy(
                book_id=book.id,
                copy_number=copy_number,
                qr_code=make_copy_qr_code(book.id, copy_number),
                status="available",
            ))
            changed += 1

        db.flush()
        changed += assign_legacy_loans_to_copies(db, book)

    if changed and commit:
        db.commit()
    return changed


def resize_book_copies(db: Session, book: Book, total: int) -> None:
    """Adjust physical stock without deleting QR identities or loan history.

    The caller holds the book row lock and commits all inventory edits together.
    """
    ensure_book_copies(db, book.id, commit=False)
    copies = db.query(BookCopy).filter(BookCopy.book_id == book.id).with_for_update().all()
    active = [copy for copy in copies if copy.status != "retired"]
    loan_copy_ids = {row[0] for row in db.query(Transaction.copy_id).filter(
        Transaction.book_id == book.id,
        Transaction.status.in_(["active", "overdue"]),
        Transaction.copy_id.isnot(None),
    ).all()}
    protected = [copy for copy in active if copy.status == "borrowed" or copy.id in loan_copy_ids]
    if total < len(protected):
        raise HTTPException(409, f"Cannot reduce total copies below {len(protected)} while those copies are on loan.")
    if total < len(active):
        candidates = sorted(
            (copy for copy in active if copy not in protected),
            key=lambda copy: (copy.status == "available", -copy.copy_number),
        )
        for copy in candidates[:len(active) - total]:
            copy.status = "retired"
    elif total > len(active):
        number = max((copy.copy_number for copy in copies), default=0)
        for _ in range(total - len(active)):
            number += 1
            copy = BookCopy(book_id=book.id, copy_number=number,
                            qr_code=make_copy_qr_code(book.id, number), status="available")
            db.add(copy)
            copies.append(copy)
    book.copies_total = total
    book.copies_available = sum(copy.status == "available" for copy in copies)
    db.flush()


def assign_legacy_loans_to_copies(db: Session, book: Book) -> int:
    changed = 0
    active_loans = (
        db.query(Transaction)
        .filter(
            Transaction.book_id == book.id,
            Transaction.status.in_(["active", "overdue"]),
            Transaction.copy_id.is_(None),
        )
        .order_by(Transaction.borrow_date, Transaction.id)
        .all()
    )
    if not active_loans:
        return 0

    available_copies = (
        db.query(BookCopy)
        .filter(BookCopy.book_id == book.id, BookCopy.status == "available")
        .order_by(BookCopy.copy_number)
        .all()
    )
    for tx, copy in zip(active_loans, available_copies):
        tx.copy_id = copy.id
        copy.status = "borrowed"
        changed += 1

    return changed


def get_copy_or_404(db: Session, copy_id: int) -> BookCopy:
    copy = db.query(BookCopy).filter(BookCopy.id == copy_id).first()
    if not copy:
        raise HTTPException(status_code=404, detail="Physical copy not found")
    return copy


def select_available_copy(db: Session, book_id: int) -> BookCopy | None:
    ensure_book_copies(db, book_id=book_id)
    return (
        db.query(BookCopy)
        .filter(BookCopy.book_id == book_id, BookCopy.status == "available")
        .order_by(BookCopy.copy_number)
        .first()
    )


def assert_copy_can_borrow(copy: BookCopy) -> None:
    if copy.status == "available":
        return
    raise HTTPException(
        status_code=409,
        detail=UNBORROWABLE_COPY_MESSAGES.get(
            copy.status,
            "This physical copy cannot be borrowed.",
        ),
    )


def resolve_scan(db: Session, raw_code: str) -> tuple[str, Book, BookCopy | None, bool, str]:
    code = normalize_scan_code(raw_code)
    copy = db.query(BookCopy).filter(BookCopy.qr_code == code).first()
    if copy:
        book = copy.book
        can_borrow = copy.status == "available" and book.copies_available > 0
        if copy.status == "available":
            message = "Copy is available for borrowing." if can_borrow else "Book has no available copies."
        else:
            message = UNBORROWABLE_COPY_MESSAGES.get(copy.status, "This physical copy cannot be borrowed.")
        return "copy", book, copy, can_borrow, message

    book = db.query(Book).filter(Book.qr_code == code).first()
    if book:
        ensure_book_copies(db, book_id=book.id)
        has_available_copy = select_available_copy(db, book.id) is not None
        can_borrow = book.copies_available > 0 and has_available_copy
        message = "Legacy book QR recognized." if can_borrow else "No available physical copy for this book."
        return "book", book, None, can_borrow, message

    raise HTTPException(status_code=404, detail="Book not found for this QR code")


def copy_label_payload(copy: BookCopy) -> dict:
    book = copy.book
    return {
        "id": copy.id,
        "book_id": copy.book_id,
        "copy_number": copy.copy_number,
        "qr_code": copy.qr_code,
        "status": copy.status,
        "title": book.title if book else "",
        "author": book.author if book else "",
        "category": book.category if book else "",
        "location_shelf": book.location_shelf if book else None,
    }
