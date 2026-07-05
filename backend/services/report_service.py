"""
PDF report generator using ReportLab.

  build_transcript(user, transactions) → bytes   (member reading report)
  build_monthly_report(stats, data)    → bytes   (librarian monthly summary)
"""
import io
from datetime import datetime

from timezone_utils import now_ph
from decimal import Decimal

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether
)


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


def _safe_int(value, default=0):
    try:
        return int(value or default)
    except (TypeError, ValueError):
        return default


def _safe_float(value, default=0.0):
    try:
        return float(value or default)
    except (TypeError, ValueError):
        return default


def _money(value):
    return f"P {_safe_float(value):,.2f}"


def _row_value(row, key, index, default=""):
    if isinstance(row, dict):
        return row.get(key, default)
    if hasattr(row, "_mapping") and key in row._mapping:
        return row._mapping.get(key, default)
    if isinstance(row, (list, tuple)) and len(row) > index:
        return row[index]
    return getattr(row, key, default)


def _section_style():
    return ParagraphStyle(
        "rpl_section",
        fontSize=11,
        fontName="Helvetica-Bold",
        textColor=INK,
        spaceBefore=4,
        spaceAfter=6,
    )


def _small_label_style():
    return ParagraphStyle(
        "rpl_small_label",
        fontSize=7,
        fontName="Helvetica-Bold",
        textColor=GREY,
        leading=8,
        spaceAfter=2,
    )


def _metric_value_style(color=INK):
    return ParagraphStyle(
        "rpl_metric",
        fontSize=16,
        fontName="Helvetica-Bold",
        textColor=color,
        leading=18,
    )


def _note_style():
    return ParagraphStyle(
        "rpl_note",
        fontSize=8,
        fontName="Helvetica",
        textColor=GREY,
        leading=10,
    )


def _metric_card(label, value, note, color=BLUE):
    return [
        Paragraph(label, _small_label_style()),
        Paragraph(str(value), _metric_value_style(color)),
        Paragraph(note, _note_style()),
    ]


def _metric_grid(cards):
    rows = []
    for i in range(0, len(cards), 2):
        row = cards[i:i + 2]
        if len(row) == 1:
            row.append(["", "", ""])
        rows.append(row)

    table = Table(rows, colWidths=[8.25 * cm, 8.25 * cm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    return table


def _simple_table(rows, col_widths):
    table = Table(rows, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, 0), SOFT_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return table


def _monthly_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GREY)
    canvas.drawString(doc.leftMargin, 1.15 * cm, "Rizal Provincial Library System - Official Monthly Report")
    canvas.drawRightString(A4[0] - doc.rightMargin, 1.15 * cm, f"Page {doc.page}")
    canvas.restoreState()


# ── Member Reading Transcript ─────────────────────────────────────────────────

def build_transcript(user, transactions: list) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    h1   = _header_style()
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
        ["Member Since", user.created_at.strftime("%B %d, %Y") if user.created_at else "—"],
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
    total_books  = len([t for t in transactions if t.type == "borrow"])
    total_fines  = sum(float(t.fine_amount or 0) for t in transactions)
    active_loans = len([t for t in transactions if t.status == "active"])

    story.append(Paragraph("Summary", ParagraphStyle(
        "sec", fontSize=11, fontName="Helvetica-Bold", textColor=SLATE, spaceAfter=6,
    )))
    summary_data = [
        ["Total Books Borrowed", str(total_books)],
        ["Currently Borrowed",   str(active_loans)],
        ["Total Fines Accrued",  f"₱{total_fines:.2f}"],
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

    borrow_txs = [t for t in transactions if t.type == "borrow"]
    if borrow_txs:
        rows = [["#", "Book Title", "Borrow Date", "Due Date", "Return Date", "Fine"]]
        for i, tx in enumerate(borrow_txs, 1):
            rows.append([
                str(i),
                (tx.book.title[:40] + "…") if tx.book and len(tx.book.title) > 40 else (tx.book.title if tx.book else "—"),
                tx.borrow_date.strftime("%b %d, %Y") if tx.borrow_date else "—",
                tx.due_date.strftime("%b %d, %Y")    if tx.due_date    else "—",
                tx.return_date.strftime("%b %d, %Y") if tx.return_date else "Active",
                f"₱{float(tx.fine_amount):.2f}"      if tx.fine_amount else "₱0.00",
            ])

        col_widths = [0.8*cm, 7*cm, 2.8*cm, 2.8*cm, 2.8*cm, 2*cm]
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

def _build_monthly_report_legacy(month_label: str, stats: dict, top_books: list, top_members: list) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    h1    = _header_style()
    body  = _body_style()
    story = []

    story.append(Paragraph("Rizal Provincial Library", h1))
    story.append(Paragraph(f"Monthly Circulation Report — {month_label}", ParagraphStyle(
        "h2", fontSize=13, fontName="Helvetica-Bold", textColor=SLATE, spaceAfter=2,
    )))
    story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=12))
    story.append(Paragraph(f"Generated: {_now_str()}", _sub_style()))

    # KPI summary
    story.append(Paragraph("Monthly Summary", ParagraphStyle(
        "sec", fontSize=11, fontName="Helvetica-Bold", textColor=SLATE, spaceAfter=6,
    )))
    kpi_data = [
        ["Total Borrows This Month",   str(stats.get("borrows",    0))],
        ["Total Returns This Month",   str(stats.get("returns",    0))],
        ["Unique Members Active",      str(stats.get("members",    0))],
        ["New Members Registered",     str(stats.get("new_members",0))],
        ["Overdue Books",              str(stats.get("overdue",    0))],
        ["Fines Collected (₱)",        f"₱{stats.get('fines', 0):.2f}"],
        ["Library Visits (Face Scan)", str(stats.get("visits",     0))],
    ]
    kpi_table = Table(kpi_data, colWidths=[10*cm, 6*cm])
    kpi_table.setStyle(TableStyle([
        ("FONTNAME",  (0,0), (0,-1),  "Helvetica-Bold"),
        ("FONTNAME",  (1,0), (1,-1),  "Helvetica"),
        ("FONTSIZE",  (0,0), (-1,-1), 9),
        ("TEXTCOLOR", (0,0), (0,-1),  BLUE),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [LIGHT, colors.white]),
        ("GRID",      (0,0), (-1,-1), 0.25, colors.HexColor("#e2e8f0")),
        ("PADDING",   (0,0), (-1,-1), 6),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 0.5*cm))

    # Top borrowed books
    if top_books:
        story.append(Paragraph("Most Borrowed Books", ParagraphStyle(
            "sec", fontSize=11, fontName="Helvetica-Bold", textColor=SLATE, spaceAfter=6,
        )))
        book_rows = [["Rank", "Title", "Author", "Category", "Borrows"]]
        for i, b in enumerate(top_books, 1):
            book_rows.append([
                str(i),
                b.get("title",    "")[:40],
                b.get("author",   "")[:25],
                b.get("category", ""),
                str(b.get("borrows", 0)),
            ])
        book_table = Table(book_rows, colWidths=[1*cm, 7*cm, 4.5*cm, 3*cm, 2*cm], repeatRows=1)
        book_table.setStyle(TableStyle([
            ("FONTNAME",  (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTNAME",  (0,1), (-1,-1), "Helvetica"),
            ("FONTSIZE",  (0,0), (-1,-1), 8),
            ("BACKGROUND",(0,0), (-1,0),  BLUE),
            ("TEXTCOLOR", (0,0), (-1,0),  colors.white),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
            ("GRID",      (0,0), (-1,-1), 0.25, colors.HexColor("#e2e8f0")),
            ("PADDING",   (0,0), (-1,-1), 5),
            ("ALIGN",     (0,0), (0,-1),  "CENTER"),
            ("ALIGN",     (-1,0),(-1,-1), "RIGHT"),
        ]))
        story.append(book_table)
        story.append(Spacer(1, 0.4*cm))

    # Top active members
    if top_members:
        story.append(Paragraph("Most Active Members", ParagraphStyle(
            "sec", fontSize=11, fontName="Helvetica-Bold", textColor=SLATE, spaceAfter=6,
        )))
        mem_rows = [["Rank", "Member ID", "Name", "Books Borrowed"]]
        for i, m in enumerate(top_members, 1):
            mem_rows.append([
                str(i),
                m.get("member_id", ""),
                m.get("name", "")[:35],
                str(m.get("borrows", 0)),
            ])
        mem_table = Table(mem_rows, colWidths=[1*cm, 3.5*cm, 10*cm, 3*cm], repeatRows=1)
        mem_table.setStyle(TableStyle([
            ("FONTNAME",  (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTNAME",  (0,1), (-1,-1), "Helvetica"),
            ("FONTSIZE",  (0,0), (-1,-1), 8),
            ("BACKGROUND",(0,0), (-1,0),  BLUE),
            ("TEXTCOLOR", (0,0), (-1,0),  colors.white),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
            ("GRID",      (0,0), (-1,-1), 0.25, colors.HexColor("#e2e8f0")),
            ("PADDING",   (0,0), (-1,-1), 5),
            ("ALIGN",     (-1,0),(-1,-1), "RIGHT"),
        ]))
        story.append(mem_table)

    story.append(Spacer(1, 1*cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GREY))
    story.append(Paragraph(
        "Rizal Provincial Library System — Official Monthly Report",
        ParagraphStyle("foot", fontSize=7, textColor=GREY, spaceBefore=6),
    ))

    doc.build(story)
    return buf.getvalue()


def build_monthly_report(month_label: str, stats: dict, top_books: list, top_members: list) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.8 * cm,
    )
    story = []

    borrows = _safe_int(stats.get("borrows"))
    returns = _safe_int(stats.get("returns"))
    active_members = _safe_int(stats.get("members", stats.get("active_members")))
    new_members = _safe_int(stats.get("new_members"))
    overdue = _safe_int(stats.get("overdue"))
    visits = _safe_int(stats.get("visits"))
    denied_visits = _safe_int(stats.get("denied_visits"))
    book_titles = _safe_int(stats.get("book_titles"))
    total_copies = _safe_int(stats.get("total_copies"))
    available_copies = _safe_int(stats.get("available_copies"))
    borrowed_copies = _safe_int(stats.get("borrowed_copies"))

    title_style = ParagraphStyle(
        "report_card_title",
        fontSize=22,
        fontName="Helvetica-Bold",
        textColor=INK,
        leading=25,
        spaceAfter=2,
    )
    eyebrow_style = ParagraphStyle(
        "report_card_eyebrow",
        fontSize=8,
        fontName="Helvetica-Bold",
        textColor=BLUE,
        leading=10,
    )
    month_style = ParagraphStyle(
        "report_card_month",
        fontSize=11,
        fontName="Helvetica-Bold",
        textColor=BLUE,
        leading=13,
    )
    right_style = ParagraphStyle(
        "report_card_generated",
        fontSize=8,
        fontName="Helvetica-Bold",
        textColor=SLATE,
        alignment=2,
    )
    purpose_style = ParagraphStyle(
        "report_card_purpose",
        fontSize=8.5,
        fontName="Helvetica",
        textColor=SLATE,
        leading=12,
    )
    summary_style = ParagraphStyle(
        "report_card_summary",
        fontSize=9,
        fontName="Helvetica",
        textColor=SLATE,
        leading=12,
    )

    header = Table(
        [[
            [
                Paragraph("Rizal Provincial Library", eyebrow_style),
                Paragraph("Monthly Library Report Card", title_style),
                Paragraph(month_label, month_style),
            ],
            [
                Paragraph("Generated", _small_label_style()),
                Paragraph(_now_str(), right_style),
            ],
        ]],
        colWidths=[12.2 * cm, 4.8 * cm],
        hAlign="LEFT",
    )
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT_BLUE),
        ("BOX", (0, 0), (-1, -1), 0.75, LINE),
        ("PADDING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(header)
    story.append(Spacer(1, 0.35 * cm))

    story.append(KeepTogether([
        Paragraph("What this report is for", _section_style()),
        Paragraph(
            "This report card summarizes monthly library activity for staff review: visitor traffic, "
            "borrowing and returns, current overdue pressure, collection availability, top borrowed books, "
            "and the members with the most circulation activity.",
            purpose_style,
        ),
    ]))
    story.append(Spacer(1, 0.28 * cm))

    movement_note = "Circulation was balanced."
    if borrows > returns:
        movement_note = f"Borrowing was higher than returns by {borrows - returns} record(s)."
    elif returns > borrows:
        movement_note = f"Returns were higher than new borrows by {returns - borrows} record(s)."

    overdue_note = "No overdue books need attention." if overdue == 0 else f"{overdue} overdue book(s) need follow-up."
    visitor_note = f"{visits} granted visitor scan(s) were recorded for the month."
    if denied_visits:
        visitor_note += f" {denied_visits} denied scan(s) should be reviewed."

    story.append(KeepTogether([
        Paragraph("What happened this month", _section_style()),
        Paragraph(
            f"{visitor_note} The system logged {borrows} borrow transaction(s), {returns} return transaction(s), "
            f"and {active_members} active member(s). {movement_note} {overdue_note}",
            summary_style,
        ),
    ]))
    story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("Visitor Summary", _section_style()))
    story.append(_metric_grid([
        _metric_card("Monthly Visitors", visits, "Granted entry scans this month", BLUE),
        _metric_card("Denied Scans", denied_visits, "Unknown or rejected gate scans", RED if denied_visits else GREEN),
        _metric_card("Active Members", active_members, "Members with borrow or return activity", GREEN),
        _metric_card("New Members", new_members, "Member accounts created this month", BLUE),
    ]))
    story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("Book Collection", _section_style()))
    story.append(_metric_grid([
        _metric_card("Book Titles", book_titles, "Unique catalog records", BLUE),
        _metric_card("Total Copies", total_copies, "All copies in the collection", INK),
        _metric_card("Available Copies", available_copies, "Copies ready to borrow", GREEN),
        _metric_card("Borrowed Copies", borrowed_copies, "Copies currently out", AMBER if borrowed_copies else GREY),
    ]))
    story.append(Spacer(1, 0.35 * cm))

    story.append(Paragraph("Circulation", _section_style()))
    story.append(_metric_grid([
        _metric_card("Borrowed This Month", borrows, "Checkout records created", BLUE),
        _metric_card("Returned This Month", returns, "Books returned during the month", GREEN),
        _metric_card("Overdue Books", overdue, "Currently overdue at report time", RED if overdue else GREEN),
        _metric_card("Fines Collected", _money(stats.get("fines")), "Fines connected to returned books", AMBER),
    ]))
    story.append(Spacer(1, 0.45 * cm))

    book_rows = [["Rank", "Title", "Author", "Category", "Borrows"]]
    if top_books:
        for i, book in enumerate(top_books, 1):
            book_rows.append([
                str(i),
                str(_row_value(book, "title", 0))[:48],
                str(_row_value(book, "author", 1))[:28],
                str(_row_value(book, "category", 2))[:20],
                str(_row_value(book, "borrows", 3, 0)),
            ])
    else:
        book_rows.append(["-", "No borrowed books recorded this month", "-", "-", "-"])

    story.append(KeepTogether([
        Paragraph("Top Borrowed Books", _section_style()),
        _simple_table(book_rows, [1.1 * cm, 7.1 * cm, 3.9 * cm, 3.1 * cm, 1.8 * cm]),
    ]))
    story.append(Spacer(1, 0.4 * cm))

    member_rows = [["Rank", "Member ID", "Name", "Books Borrowed"]]
    if top_members:
        for i, member in enumerate(top_members, 1):
            member_rows.append([
                str(i),
                str(_row_value(member, "member_id", 0)),
                str(_row_value(member, "name", 1))[:42],
                str(_row_value(member, "borrows", 2, 0)),
            ])
    else:
        member_rows.append(["-", "-", "No member borrow activity recorded this month", "-"])

    story.append(KeepTogether([
        Paragraph("Most Active Members", _section_style()),
        _simple_table(member_rows, [1.1 * cm, 3.5 * cm, 9.4 * cm, 3.0 * cm]),
    ]))

    story.append(Spacer(1, 0.35 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE))
    story.append(Paragraph(
        "Use this report to review monthly library service, identify overdue follow-up work, "
        "and understand demand for books and entrance traffic.",
        ParagraphStyle("report_card_footer_note", fontSize=7.5, textColor=GREY, leading=10, spaceBefore=6),
    ))

    doc.build(story, onFirstPage=_monthly_footer, onLaterPages=_monthly_footer)
    return buf.getvalue()
