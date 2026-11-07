"""Deterministic category mapping; no network calls or implicit commits."""
import re
import unicodedata

from sqlalchemy import text
from models.book import Book

MASTER_KEYWORDS = {
    # Open Library's Browse the stacks (Featured is a collection, not a genre).
    # A single-category catalog prioritizes audience, then specific genres.
    "Kids": ("juvenile", "young adult", "ya", "children", "picture book", "kids"),
    "Sci-Fi": ("science fiction", "sci fi", "scifi", "dystopian", "space opera", "cyberpunk"),
    "Fantasy": ("fantasy", "magic", "fairy tales"),
    "Mystery": ("mystery", "mysteries", "detective", "whodunit"),
    "Thriller": ("thriller", "suspense", "espionage"),
    "Crime": ("crime", "criminal", "noir"),
    "Drama": ("drama", "plays", "theater", "theatre"),
    "Horror": ("horror", "ghost stories"),
    "Romance": ("romance", "romantic", "love stories"),
    "Biography": ("biography", "biographies", "autobiography", "memoir", "diaries"),
    "History": ("history", "historical", "civilization"),
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
            # Token boundaries avoid YA/royalty, magic/magical realism mistakes.
            if re.search(r"\b" + re.escape(keyword) + r"\b", value):
                return parent
    return None


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

    Unmatched subjects stay in librarian review regardless of book count.
    Raw provider labels are preserved; only fixed browse categories are public.
    """
    category_write_lock(db)
    db.flush()
    books = db.query(Book).order_by(Book.id).all()
    labels = [book.raw_api_label if book.raw_api_label is not None else book.category for book in books]
    changed = 0
    for book, raw in zip(books, labels):
        override = book.category_override
        parent = override if override in {"General", *MASTER_KEYWORDS} else mapped_parent(raw)
        hidden = parent is None
        category = parent or "General"
        if (book.raw_api_label, book.category, book.is_hidden) != (raw, category, hidden):
            book.raw_api_label, book.category, book.is_hidden = raw, category, hidden
            changed += 1
    db.flush()
    return changed
