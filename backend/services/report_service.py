"""
PDF report generator using ReportLab.

  build_transcript(user, transactions) → bytes   (member reading report)
  build_monthly_report(stats, data)    → bytes   (librarian monthly summary)
"""
import io
from datetime import datetime

from timezone_utils import now_ph, as_ph
from decimal import Decimal

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
)


# Presentation only: retain fine calculations and source report fields.
SHOW_FINES = False


# ── Colour palette ─────────────────────────────────────────────────────────────
BLUE   = colors.HexColor("#2563eb")
SLATE  = colors.HexColor("#1e293b")
LIGHT  = colors.HexColor("#f1f5f9")
GREY   = colors.HexColor("#64748b")
RED    = colors.HexColor("#ef4444")
GREEN  = colors.HexColor("#22c55e")
AMBER  = colors.HexColor("#f59e0b")
INK    = colors.HexColor("#0f172a")
LINE   = colors.HexColor("#dbeafe")
SOFT_BLUE = colors.HexColor("#eff6ff")


def _header_style():
    s = getSampleStyleSheet()
    return ParagraphStyle(
        "rpl_h1", parent=s["Normal"],
        fontSize=20, fontName="Helvetica-Bold",
        textColor=BLUE, spaceAfter=4,
    )

def _sub_style():
    s = getSampleStyleSheet()
    return ParagraphStyle(
        "rpl_sub", parent=s["Normal"],
        fontSize=9, fontName="Helvetica",
        textColor=GREY, spaceAfter=12,
    )

def _body_style():
    s = getSampleStyleSheet()
    return ParagraphStyle(
        "rpl_body", parent=s["Normal"],
        fontSize=9, fontName="Helvetica",
        textColor=SLATE,
    )

def _now_str():
    return now_ph().strftime("%B %d, %Y %H:%M PHT")


# ── Member Reading Transcript ─────────────────────────────────────────────────

def build_transcript(user, transactions: list) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    h1   = _header_style()
    h1.leading = 24
    sub  = _sub_style()
    body = _body_style()
    story = []

    # Header
    story.append(Paragraph("Rizal Provincial Library", h1))
    story.append(Paragraph("Reading Transcript", ParagraphStyle(
        "h2", fontSize=13, fontName="Helvetica-Bold", textColor=SLATE, spaceAfter=2,
    )))
    story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=12))

    # Member info
    info_data = [
        ["Member Name",  user.name],
        ["Member ID",    user.member_id or f"RPL-{user.id:05d}"],
        ["Email",        user.email],
        ["Member Since", as_ph(user.created_at).strftime("%B %d, %Y") if user.created_at else "—"],
        ["Generated",    _now_str()],
    ]
    info_table = Table(info_data, colWidths=[4*cm, 12*cm])
    info_table.setStyle(TableStyle([
        ("FONTNAME",  (0,0), (-1,-1), "Helvetica"),
        ("FONTNAME",  (0,0), (0,-1),  "Helvetica-Bold"),
        ("FONTSIZE",  (0,0), (-1,-1), 9),
        ("TEXTCOLOR", (0,0), (0,-1),  BLUE),
        ("TEXTCOLOR", (1,0), (1,-1),  SLATE),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [LIGHT, colors.white]),
        ("GRID",      (0,0), (-1,-1), 0.25, colors.HexColor("#e2e8f0")),
        ("PADDING",   (0,0), (-1,-1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.5*cm))

    # Summary stats
    total_books  = len([t for t in transactions if t.borrow_date is not None])
    total_fines  = sum(float(t.fine_amount or 0) for t in transactions)
    active_loans = len([t for t in transactions if t.status == "active"])

    story.append(Paragraph("Summary", ParagraphStyle(
        "sec", fontSize=11, fontName="Helvetica-Bold", textColor=SLATE, spaceAfter=6,
    )))
    summary_data = [
        ["Total Books Borrowed", str(total_books)],
        ["Currently Borrowed",   str(active_loans)],
        *([
        ["Total Fines Accrued",  f"₱{total_fines:.2f}"],
        ] if SHOW_FINES else []),
    ]
    summary_table = Table(summary_data, colWidths=[8*cm, 8*cm])
    summary_table.setStyle(TableStyle([
        ("FONTNAME",  (0,0), (-1,-1), "Helvetica"),
        ("FONTNAME",  (0,0), (0,-1),  "Helvetica-Bold"),
        ("FONTSIZE",  (0,0), (-1,-1), 9),
        ("BACKGROUND",(0,0), (-1,-1), LIGHT),
        ("GRID",      (0,0), (-1,-1), 0.25, colors.HexColor("#e2e8f0")),
        ("PADDING",   (0,0), (-1,-1), 6),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.5*cm))

    # Borrow history table
    story.append(Paragraph("Borrow History", ParagraphStyle(
        "sec", fontSize=11, fontName="Helvetica-Bold", textColor=SLATE, spaceAfter=6,
    )))

    borrow_txs = [t for t in transactions if t.borrow_date is not None]
    if borrow_txs:
        rows = [["#", "Book Title", "Borrow Date", "Due Date", "Return Date", "Fine"]]
        for i, tx in enumerate(borrow_txs, 1):
            rows.append([
                str(i),
                (tx.book.title[:40] + "…") if tx.book and len(tx.book.title) > 40 else (tx.book.title if tx.book else "—"),
                as_ph(tx.borrow_date).strftime("%b %d, %Y") if tx.borrow_date else "—",
                as_ph(tx.due_date).strftime("%b %d, %Y")    if tx.due_date    else "—",
                as_ph(tx.return_date).strftime("%b %d, %Y") if tx.return_date else "Active",
                f"₱{float(tx.fine_amount):.2f}"      if tx.fine_amount else "₱0.00",
            ])

        col_widths = [0.8*cm, 7*cm, 2.8*cm, 2.8*cm, 2.8*cm, 2*cm]
        if not SHOW_FINES:
            rows = [row[:-1] for row in rows]
            col_widths = [0.8*cm, 6*cm, 3*cm, 3*cm, 3*cm]
        hist_table = Table(rows, colWidths=col_widths, repeatRows=1)
        hist_table.setStyle(TableStyle([
            ("FONTNAME",    (0,0), (-1,0),   "Helvetica-Bold"),
            ("FONTNAME",    (0,1), (-1,-1),  "Helvetica"),
            ("FONTSIZE",    (0,0), (-1,-1),  8),
            ("BACKGROUND",  (0,0), (-1,0),   BLUE),
            ("TEXTCOLOR",   (0,0), (-1,0),   colors.white),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
            ("GRID",        (0,0), (-1,-1),  0.25, colors.HexColor("#e2e8f0")),
            ("PADDING",     (0,0), (-1,-1),  5),
            ("ALIGN",       (0,0), (0,-1),   "CENTER"),
            ("ALIGN",       (-1,0), (-1,-1), "RIGHT"),
        ]))
        story.append(hist_table)
    else:
        story.append(Paragraph("No borrow history found.", body))

    story.append(Spacer(1, 1*cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY))
    story.append(Paragraph(
        f"This transcript was generated on {_now_str()} by the Rizal Provincial Library System.",
        ParagraphStyle("foot", fontSize=7, textColor=GREY, spaceBefore=6),
    ))

    doc.build(story)
    return buf.getvalue()


# ── Librarian Monthly Report ───────────────────────────────────────────────────

def build_monthly_report(report: dict) -> bytes:
    from services.monthly_report import render_monthly_pdf
    return render_monthly_pdf(report)
