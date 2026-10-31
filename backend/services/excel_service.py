"""
Excel bulk import service.

Expected .xlsx column headers (case-insensitive):
  Title | Author | Category | Year | ISBN | Copies | Location | Cover URL

Invalid rows are reported with their original workbook row number.
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
    return value


# Map flexible header names → canonical field names
HEADER_MAP = {
    "title":      "title",
    "book title": "title",
    "author":     "author",
    "category":   "category",
    "genre":      "category",
    "category/genre": "category",
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

    if not {"title", "author"}.issubset(col_map):
        wb.close()
        raise ValueError("Title and Author headers are required")
    books = []
    for row_number, row in enumerate(rows[1:], start=2):
        if not any(value is not None for value in row):
            continue
        book = {field: cell(row, field) for field in col_map}
        book["category"] = book.get("category") or "General"
        book["copies_total"] = book.get("copies_total") or 1
        book["_row_number"] = row_number
        books.append(book)
    wb.close()
    return books
