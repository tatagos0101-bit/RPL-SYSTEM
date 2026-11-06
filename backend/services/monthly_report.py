"""Complete categorized monthly PDF from the shared read-only reporting projections."""
import calendar
import html
import io
from datetime import date

from fastapi import HTTPException
from sqlalchemy import func
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle, PageBreak

from models.entry_log import EntryLog
from schemas.reporting import ReportFilters
from services import reporting
from services.reporting_exports import display
from timezone_utils import now_ph

MAX_MONTHLY_ROWS = 20_000
PRIVATE_KEYS = {'visitor_key', 'patron_key'}


def monthly_data(db, month, year):
    as_of = now_ph()
    start = date(year, month, 1)
    end = date(year, month, calendar.monthrange(year, month)[1])
    base = {'start': start, 'end': end, 'period': 'month', 'group': 'day'}
    definitions = [
        ('visits', 'Library usage', 'Granted attendance sessions in the selected month. Denied attempts are listed separately and never counted as visits.', {}),
        ('circulation', 'Circulation', 'Loans borrowed or returned in the selected month. A returned loan retains its original borrow date. Outstanding loans are a separate current snapshot.', {}),
        ('patrons', 'Patrons', 'Current non-deleted member accounts as of generation, with borrowing, attendance and registration activity for the selected month. Identifiers are used instead of personal contact details.', {'date_scope': 'all'}),
        ('collection', 'Collection', 'Current catalog and physical-copy records, including retained retired copies. Historical collection state cannot be reconstructed from current inventory.', {'date_scope': 'all'}),
        ('acquisitions', 'Acquisitions', 'Copies with a verified acquisition date in the selected month. Unknown-date copies appear separately and do not count as monthly acquisitions.', {}),
        ('inventory', 'Inventory', 'Current recorded title/copy quantities and outstanding-loan discrepancies. This report does not repair inventory.', {}),
    ]
    total_rows = 0

    def dataset(filters, title, summary=True):
        nonlocal total_rows
        sub = reporting.projection(db, filters, as_of).subquery()
        count = db.query(func.count()).select_from(sub).scalar() or 0
        total_rows += count
        if total_rows > MAX_MONTHLY_ROWS:
            raise HTTPException(422, f'This monthly PDF exceeds {MAX_MONTHLY_ROWS:,} detail records. No partial PDF was generated. Use source-filtered reports for smaller downloads.')
        columns = [{'key': key, 'label': key.replace('_', ' ').title()} for key in sub.c.keys() if key not in PRIVATE_KEYS]
        rows = reporting.encode_rows(db.query(sub).order_by(sub.c.id).all())
        rows = [{column['key']: row[column['key']] for column in columns} for row in rows]
        metrics, charts = reporting.analyze(db, filters, as_of, sub) if summary else ({'matching_records': count}, [])
        return {'title': title, 'total': count, 'columns': columns, 'rows': rows, 'summary': metrics, 'breakdowns': charts}

    sections = []
    for category, title, scope, extra in definitions:
        filters = ReportFilters(category=category, **base, **extra)
        main = dataset(filters, 'Monthly activity' if category in ('visits', 'circulation', 'acquisitions') else 'Current records')
        datasets = [main]
        if category == 'visits':
            lower, upper = reporting.boundaries(filters, as_of)
            query = db.query(EntryLog.id.label('id'), EntryLog.accessed_at.label('attempted'), EntryLog.entry_type.label('entry_method')).filter(EntryLog.granted.is_(False), reporting.between(EntryLog.accessed_at, lower, upper))
            count = query.count()
            total_rows += count
            if total_rows > MAX_MONTHLY_ROWS:
                raise HTTPException(422, 'This monthly PDF is too large. Use filtered reports; no partial PDF was generated.')
            rows = reporting.encode_rows(query.order_by(EntryLog.id).all())
            datasets.append({'title': 'Denied entry attempts - not visits', 'total': count, 'rows': rows,
                'columns': [{'key': key, 'label': key.replace('_', ' ').title()} for key in ('id', 'attempted', 'entry_method')], 'summary': {}, 'breakdowns': []})
        if category == 'circulation':
            current = dataset(filters.model_copy(update={'loan_status': 'outstanding'}), 'Outstanding loans - current snapshot', summary=False)
            current['summary']['overdue_loans'] = sum(row['status'] == 'overdue' for row in current['rows'])
            datasets.append(current)
        if category == 'acquisitions':
            datasets.append(dataset(filters.model_copy(update={'date_scope': 'unknown'}), 'Unknown acquisition date - current records', summary=False))
        sections.append({'category': category, 'title': title, 'scope': scope, 'notes': reporting.notes(filters), 'datasets': datasets})
    return {'month': start.strftime('%B %Y'), 'start': start.isoformat(), 'end': end.isoformat(), 'as_of': as_of.isoformat(), 'sections': sections, 'total_rows': total_rows}


def render_monthly_pdf(report):
    output = io.BytesIO()
    page_size = landscape(A4)
    width = page_size[0] - 72
    normal = ParagraphStyle('MonthlyBody', fontName='Helvetica', fontSize=9, leading=13, textColor=colors.black, spaceAfter=6)
    small = ParagraphStyle('MonthlyCell', parent=normal, fontSize=8, leading=11, spaceAfter=0, splitLongWords=True)
    bold = ParagraphStyle('MonthlyCellHeading', parent=small, fontName='Helvetica-Bold')
    heading = ParagraphStyle('MonthlySection', parent=normal, fontName='Helvetica-Bold', fontSize=17, leading=22, spaceAfter=10, keepWithNext=True)
    subheading = ParagraphStyle('MonthlySubsection', parent=normal, fontName='Helvetica-Bold', fontSize=11, leading=15, spaceBefore=10, spaceAfter=6, keepWithNext=True)
    title = ParagraphStyle('MonthlyTitle', parent=heading, fontSize=22, leading=27)
    paragraph = lambda value, style=small: Paragraph(html.escape(display(value)).replace('\n', '<br/>'), style)

    def table(columns, rows, label, widths=None):
        # Repeat the category/dataset name and column headings on every table page.
        grid = [[paragraph(label, bold)] + [''] * (len(columns)-1), [paragraph(column, bold) for column in columns]]
        grid.extend([[paragraph(value) for value in row] for row in rows])
        return LongTable(grid, colWidths=widths or [width / len(columns)] * len(columns), repeatRows=2, hAlign='LEFT', splitInRow=1,
            style=TableStyle([('SPAN', (0,0), (-1,0)), ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('LINEBELOW', (0,0), (-1,1), .6, colors.black), ('LINEBELOW', (0,2), (-1,-1), .25, colors.Color(.7,.7,.7)),
                ('LEFTPADDING',(0,0),(-1,-1),6), ('RIGHTPADDING',(0,0),(-1,-1),6),
                ('TOPPADDING',(0,0),(-1,-1),6), ('BOTTOMPADDING',(0,0),(-1,-1),6)]))

    story = [paragraph('Rizal Provincial Library', title), paragraph('Monthly Library Report', heading),
        paragraph(report['month'], subheading), paragraph(f"Period: {report['start']} through {report['end']} (Philippine time)", normal),
        paragraph(f"Generated: {display(report['as_of'])}", normal),
        paragraph('Monthly activity and current snapshots are clearly separated below. Current-month activity ends at generation time.', normal),
        Spacer(1,12)]
    overview = []
    for index, section in enumerate(report['sections'], 1):
        main = section['datasets'][0]
        overview.append([f"{index}. {section['title']}", main['title'], main['total']])
    story.append(table(['Category', 'Primary record scope', 'Records'], overview, 'Contents and coverage', [width*.3,width*.5,width*.2]))
    story += [Spacer(1,12), paragraph('All matching detail rows are included. A record may appear in both monthly activity and a current snapshot; those sections must not be added together. Missing information is marked Not recorded.', normal)]
    for index, section in enumerate(report['sections'], 1):
        story += [PageBreak(), paragraph(f"{index}. {section['title']}", heading), paragraph(section['scope'], normal)]
        for note in section['notes']:
            story.append(paragraph(note, normal))
        for dataset in section['datasets']:
            label = f"{section['title']} / {dataset['title']}"
            story.append(paragraph(dataset['title'], subheading))
            if dataset['summary']:
                values = [[key.replace('_',' ').capitalize(), 'No comparable baseline' if key.endswith('_percent') and value is None else value] for key, value in dataset['summary'].items()]
                story.append(table(['Measure', 'Value'], values, label + ' / Summary', [width*.6,width*.4]))
            for breakdown in dataset['breakdowns']:
                points = breakdown['points']
                if not points:
                    continue
                keys = list(dict.fromkeys(key for point in points for key in point))
                story += [Spacer(1,10), table([key.replace('_',' ').title() for key in keys], [[point.get(key) for key in keys] for point in points], label + ' / ' + breakdown['title'])]
            story += [paragraph(f"Detailed records ({dataset['total']:,})", subheading)]
            if not dataset['rows']:
                story.append(paragraph('No matching records.', normal))
                continue
            columns = dataset['columns']
            # Six columns maximum; repeat the stable ID in each additional group.
            groups = [columns[:6]] + [[columns[0]] + columns[offset:offset+5] for offset in range(6,len(columns),5)]
            for group_index, group in enumerate(groups, 1):
                if group_index > 1:
                    story.append(Spacer(1,10))
                story += [table([column['label'] for column in group],
                    [[row.get(column['key']) for column in group] for row in dataset['rows']],
                    f"{label} / Details {group_index} of {len(groups)}")]
    def footer(canvas, document):
        canvas.saveState(); canvas.setFillColor(colors.black); canvas.setStrokeColor(colors.black)
        canvas.setFont('Helvetica',8); canvas.drawString(36,19,f"Rizal Provincial Library | {report['month']} | Philippine time")
        canvas.drawRightString(page_size[0]-36,19,f'Page {document.page}'); canvas.restoreState()
    doc = SimpleDocTemplate(output, pagesize=page_size, leftMargin=36,rightMargin=36,topMargin=36,bottomMargin=36,
        title=f"Rizal Provincial Library - {report['month']}", author='Rizal Provincial Library')
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return output.getvalue()
