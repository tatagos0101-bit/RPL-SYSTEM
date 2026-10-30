"""Deterministic category mapping; no network calls or implicit commits."""
import hashlib
import re
import unicodedata
from collections import Counter

from sqlalchemy import text
from models.book import Book

MASTER_KEYWORDS = {
    "Sci-Fi & Fantasy": ("science fiction", "sci fi", "scifi", "fantasy", "dystopian", "space opera", "cyberpunk"),
    "Mystery & Thriller": ("mystery", "thriller", "suspense", "crime", "detective", "noir"),
    "Biography & Memoir": ("biography", "autobiography", "memoir", "letters", "diaries"),
    "Business & Economics": ("business", "economics", "finance", "management", "marketing"),
    "Children & YA": ("juvenile", "young adult", "ya", "children's", "picture book"),
}


def sanitize_label(raw: str) -> str:
    value = unicodedata.normalize("NFKC", raw).lower().replace("’", "'")
    # Protect this compound before removing generic tags.
    value = re.sub(r"\bscience[\s/-]+fiction\b", "sciencefictiontoken", value)
    value = re.sub(r"[-/–—:]+", " ", value)
    value = re.sub(r"[^\w\s']", " ", value)
    value = re.sub(r"\b(?:general|fiction|nonfiction|non fiction)\b", " ", value)
    value = value.replace("sciencefictiontoken", "science fiction")
    return " ".join(value.split())


def mapped_parent(raw: str) -> str | None:
    # Canonical names round-trip without being reclassified by keyword order.
    for parent in MASTER_KEYWORDS:
        if raw.strip().casefold() == parent.casefold():
            return parent
    value = sanitize_label(raw)
    if not value:
        return "General"
    for parent, keywords in MASTER_KEYWORDS.items():
        for keyword in keywords:
            # Whole-token YA avoids false positives such as 'royalty'.
            if (re.search(r"\bya\b", value) if keyword == "ya" else keyword in value):
                return parent
    return None


def public_label(raw: str) -> str:
    value = raw.strip()
    if len(value) <= 80:
        return value
    # Keep the existing VARCHAR(80) contract without merging different long labels.
    return value[:67] + " [" + hashlib.sha256(value.encode()).hexdigest()[:10] + "]"


def category_write_lock(db):
    # Serializes category writes/count promotion across PostgreSQL workers.
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(72851002)"))


def assign_category(book: Book, raw: str):
    book.category_override = None
    book.raw_api_label = raw.strip() or "General"
    parent = mapped_parent(book.raw_api_label)
    book.category = parent or "General"
    book.is_hidden = parent is None


def reconcile_categories(db) -> int:
    """Recompute live counts, also backfilling legacy raw labels. Caller commits.

    Counts book records, never physical copies. Exact raw spelling is intentional.
    Reversible: editing/deleting below 11 hides the label again.
    """
    category_write_lock(db)
    db.flush()
    books = db.query(Book).order_by(Book.id).all()
    labels = [book.raw_api_label if book.raw_api_label is not None else book.category for book in books]
    counts = Counter(raw for book, raw in zip(books, labels) if not book.category_override)
    changed = 0
    for book, raw in zip(books, labels):
        parent = book.category_override or mapped_parent(raw)
        hidden = parent is None and counts[raw] <= 10
        category = parent or ("General" if hidden else public_label(raw))
        if (book.raw_api_label, book.category, book.is_hidden) != (raw, category, hidden):
            book.raw_api_label, book.category, book.is_hidden = raw, category, hidden
            changed += 1
    db.flush()
    return changed
