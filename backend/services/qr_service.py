"""
QR code service.

Legacy book QR codes use "RPL-{id:05d}". New physical-copy QR codes use
"RPL-BOOK-{book_id:05d}-C{copy_number:03d}" and are generated through
services.book_copy_service.
"""
import io

import qrcode
from qrcode.image.pil import PilImage


def make_qr_code(book_id: int) -> str:
    """Return the legacy canonical QR code string for a book title record."""
    return f"RPL-{book_id:05d}"


def generate_qr_png(qr_string: str) -> bytes:
    """
    Generate a QR code PNG for the given string.
    Returns raw PNG bytes suitable for a StreamingResponse.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_string)
    qr.make(fit=True)

    img: PilImage = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _truncate(value: str, limit: int = 38) -> str:
    value = value or ""
    return value[:limit] + "..." if len(value) > limit else value


def _copy_label_items(books_or_copies: list) -> list[dict]:
    items = []
    for item in books_or_copies:
        if hasattr(item, "copy_number"):
            book = item.book
            items.append({
                "qr_code": item.qr_code,
                "copy_label": f"Copy {item.copy_number}",
                "title": book.title if book else "",
                "author": book.author if book else "",
                "shelf": book.location_shelf if book else None,
            })
            continue

        copies = sorted(getattr(item, "copies", []) or [], key=lambda copy: copy.copy_number)
        if copies:
            for copy in copies:
                items.append({
                    "qr_code": copy.qr_code,
                    "copy_label": f"Copy {copy.copy_number}",
                    "title": item.title,
                    "author": item.author,
                    "shelf": item.location_shelf,
                })
        else:
            items.append({
                "qr_code": item.qr_code or make_qr_code(item.id),
                "copy_label": "Legacy Book QR",
                "title": item.title,
                "author": item.author,
                "shelf": item.location_shelf,
            })
    return items


def generate_bulk_pdf(books_or_copies: list) -> bytes:
    """
    Generate a printable PDF with one QR code label per physical book copy.
    Accepts Book ORM objects or BookCopy ORM objects.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    from PIL import Image
    import io as _io

    buf = _io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    page_w, page_h = A4

    cols = 3
    cell_w = page_w / cols
    cell_h = 7 * cm
    per_page = cols * int(page_h / cell_h)
    labels = _copy_label_items(books_or_copies)

    for idx, label_data in enumerate(labels):
        col = idx % cols
        row = (idx % per_page) // cols

        if idx > 0 and idx % per_page == 0:
            c.showPage()

        x = col * cell_w
        y = page_h - (row + 1) * cell_h

        qr_bytes = generate_qr_png(label_data["qr_code"])
        qr_img = Image.open(_io.BytesIO(qr_bytes))
        qr_reader = ImageReader(qr_img)

        qr_size = 3.5 * cm
        qr_x = x + (cell_w - qr_size) / 2
        qr_y = y + cell_h - qr_size - 0.4 * cm
        c.drawImage(qr_reader, qr_x, qr_y, width=qr_size, height=qr_size)

        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(x + cell_w / 2, qr_y - 0.4 * cm, label_data["qr_code"])

        c.setFont("Helvetica-Bold", 6)
        c.drawCentredString(x + cell_w / 2, qr_y - 0.72 * cm, label_data["copy_label"])

        c.setFont("Helvetica", 6)
        c.drawCentredString(x + cell_w / 2, qr_y - 1.02 * cm, _truncate(label_data["title"]))
        c.drawCentredString(x + cell_w / 2, qr_y - 1.32 * cm, _truncate(label_data["author"]))
        c.drawCentredString(x + cell_w / 2, qr_y - 1.62 * cm, _truncate(label_data["shelf"] or "Shelf not set"))

        c.rect(x + 0.15 * cm, y + 0.15 * cm, cell_w - 0.3 * cm, cell_h - 0.3 * cm)

    c.save()
    return buf.getvalue()
