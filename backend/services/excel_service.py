"""
Excel bulk import service.

Expected .xlsx column headers (case-insensitive):
  Title | Author | Category | Year | ISBN | Copies | Location | Cover URL

Any rows missing Title or Author are skipped.
Duplicate ISBNs (already in DB) are also skipped.
"""
import io
import re
from openpyxl import load_workbook

# Strip leading = + - @ characters that trigger formula injection in spreadsheet apps,
# and control characters that have no place in book metadata.
_FORMULA_PREFIX = re.compile(r"^[=+\-@\t\r]+")
_CONTROL_CHARS  = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _sanitize(value: str, max_length: int = 500) -> str:
    """Strip formula-injection prefixes and control characters from a cell string."""
    value = _CONTROL_CHARS.sub("", value)
    value = _FORMULA_PREFIX.sub("", value).strip()
    return value[:max_length]


# Map flexible header names → canonical field names
HEADER_MAP = {
    "title":      "title",
    "book title": "title",
    "author":     "author",
    "category":   "category",
    "genre":      "category",
    "year":       "year",
    "isbn":       "isbn",
    "copies":     "copies_total",
    "copy":       "copies_total",
    "copies total": "copies_total",
    "location":   "location_shelf",
    "shelf":      "location_shelf",
    "location shelf": "location_shelf",
    "cover":      "cover_url",
    "cover url":  "cover_url",
    "image":      "cover_url",
    "image url":  "cover_url",
}


def parse_excel(file_bytes: bytes) -> list[dict]:
    """
    Parse an .xlsx file and return a list of book dicts.
    Each dict has keys: title, author, category, year, isbn,
                        copies_total, location_shelf, cover_url
    """
    wb = load_workbook(filename=io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    # Build column index from first row headers
    raw_headers = [str(h).strip().lower() if h else "" for h in rows[0]]
    col_map = {}   # canonical_field → column_index
    for i, h in enumerate(raw_headers):
        canonical = HEADER_MAP.get(h)
        if canonical and canonical not in col_map:
            col_map[canonical] = i

    def cell(row, field, max_length: int = 500):
        idx = col_map.get(field)
        if idx is None or idx >= len(row):
            return None
        val = row[idx]
        if val is None:
            return None
        return _sanitize(str(val), max_length)

    books = []
    for row in rows[1:]:
        title  = cell(row, "title",  max_length=500)
        author = cell(row, "author", max_length=200)
        if not title or not author:
            continue   # required fields missing

        year_raw = cell(row, "year")
        try:
            year_int = int(float(year_raw)) if year_raw else None
            year = year_int if year_int and 1000 <= year_int <= 2200 else None
        except ValueError:
            year = None

        copies_raw = cell(row, "copies_total")
        try:
            copies = max(1, min(10000, int(float(copies_raw)))) if copies_raw else 1
        except ValueError:
            copies = 1

        isbn_raw = cell(row, "isbn", max_length=20)
        # Only keep ISBNs that look valid (digits and hyphens)
        isbn = isbn_raw if isbn_raw and re.match(r"^[\d\-X]{8,20}$", isbn_raw, re.IGNORECASE) else None

        cover_raw = cell(row, "cover_url", max_length=500)
        # Only accept http/https URLs for cover images from spreadsheet
        cover = cover_raw if cover_raw and re.match(r"^https?://", cover_raw, re.IGNORECASE) else None

        books.append({
            "title":            title,
            "author":           author,
            "category":         cell(row, "category", max_length=100) or "General",
            "year":             year,
            "isbn":             isbn,
            "copies_total":     copies,
            "copies_available": copies,
            "location_shelf":   cell(row, "location_shelf", max_length=100),
            "cover_url":        cover,
        })

    wb.close()
    return books
