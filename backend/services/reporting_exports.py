"""Exports consume the exact validated report projection. No database queries here."""
import csv
import html
import io
from datetime import datetime
from zipfile import ZipFile, ZIP_DEFLATED

from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.graphics.shapes import Drawing, Rect, String
from timezone_utils import now_ph


def safe_cell(value):
    if value is None: return ''
    if isinstance(value, str) and (value.lstrip().startswith(('=', '+', '-', '@')) or value.startswith(('\t', '\r', '\n'))):
        return "'" + value
    return value


def display(value):
    if value is None: return 'Not recorded'
    if isinstance(value, str) and 'T' in value:
        try:
            return datetime.fromisoformat(value).strftime('%Y-%m-%d %H:%M:%S PHT')
        except ValueError: pass
    return str(value)


def metadata(report):
    category = report['filters']['category']
    relevant = lambda key: (key != 'holdings' or category == 'collection') and (key != 'date_scope' or category in ('patrons', 'collection', 'acquisitions')) and (key != 'date_basis' or category == 'circulation')
    return [('Library', 'Rizal Provincial Library'), ('Report', report['title']), ('Evaluated at', report['as_of']),
            ('Matching records', report['total'])] + [('Filter: ' + key, str(value)) for key, value in report['filters'].items() if value not in ('', None) and relevant(key)] + [('Note', note) for note in report['notes']]


def export_report(report, format, scope):
    columns = report['columns']
    rows = report['rows']
    meta = metadata(report) + [('Generated at', now_ph().isoformat()), ('Export scope', scope), ('Exported detail rows', len(rows))]
    if format == 'csv':
        output = io.StringIO(newline='')
        writer = csv.writer(output)
        if scope == 'summary':
            writer.writerow(['Metric', 'Value'])
            writer.writerows((safe_cell(k), safe_cell(v)) for k, v in report['summary'].items())
        else:
            writer.writerow([c['label'] for c in columns])
            writer.writerows([safe_cell(row.get(c['key'])) for c in columns] for row in rows)
        archive = io.BytesIO()
        with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
            bundle.writestr('records.csv', '\ufeff' + output.getvalue())
            bundle.writestr('report-metadata.txt', '\n'.join(f'{key}: {value}' for key, value in meta))
        return archive.getvalue(), 'application/zip', 'zip'
    if format == 'xlsx':
        workbook = Workbook(write_only=True)
        sheet = workbook.create_sheet('Report information')
        for row in meta: sheet.append([safe_cell(v) for v in row])
        summary = workbook.create_sheet('Summary')
        summary.append(['Metric', 'Value'])
        for row in report['summary'].items(): summary.append([safe_cell(v) for v in row])
        if scope != 'summary':
            detail = workbook.create_sheet('Records')
            detail.append([c['label'] for c in columns])
            from openpyxl.cell import WriteOnlyCell
            for row in rows:
                cells = []
                for c in columns:
                    value = row.get(c['key'])
                    if c['key'] == 'cost' and value is not None: value = float(value)
                    cell = WriteOnlyCell(detail, value=value)
                    if isinstance(value, str):
                        cell.data_type = 's'  # Explicit text, never a formula.
                        if c['key'] in ('visited', 'departed', 'borrowed', 'returned', 'due', 'registered', 'copy_recorded', 'title_recorded', 'acquired', 'version'):
                            try:
                                cell = WriteOnlyCell(detail, datetime.fromisoformat(value).replace(tzinfo=None))
                                cell.number_format = 'yyyy-mm-dd hh:mm:ss'
                            except ValueError: pass
                    cells.append(cell)
                detail.append(cells)
        result = io.BytesIO(); workbook.save(result)
        return result.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'
    if format == 'print':
        escape = lambda v: html.escape(display(v))
        tables = ''
        groups = [columns[i:i+6] for i in range(0, len(columns), 6)]
        if rows and scope != 'summary':
            for index, group in enumerate(groups):
                if index and columns[0] not in group: group = [columns[0]] + group
                headings = ''.join(f'<th>{escape(c["label"])}</th>' for c in group)
                body = ''.join('<tr>' + ''.join(f'<td>{escape(row.get(c["key"]))}</td>' for c in group) + '</tr>' for row in rows)
                tables += f'<h3>Detailed records — section {index+1} of {len(groups)}</h3><table><thead><tr>{headings}</tr></thead><tbody>{body}</tbody></table>'
        summary = ''.join(f'<tr><th>{escape(key)}</th><td>{escape(value)}</td></tr>' for key, value in report['summary'].items())
        info = ''.join(f'<p><strong>{escape(key)}:</strong> {escape(value)}</p>' for key, value in meta)
        charts = ''
        for chart in [c for c in report['charts'] if c['type'] != 'grouped'][:4]:
            points = chart['points'][:8]
            if not points: continue
            high = max(1, *(p.get('value', 0) or 0 for p in points))
            marks = ''.join(f'<g><rect x="{i*85+10}" y="{125-(p.get("value",0) or 0)/high*90}" width="45" height="{(p.get("value",0) or 0)/high*90}" fill="#2457a7"/><text x="{i*85+10}" y="145" font-size="9">{escape(str(p["label"])[:13])}</text><text x="{i*85+10}" y="20" font-size="11">{escape(p.get("value",0))}</text></g>' for i,p in enumerate(points))
            charts += f'<section style="break-inside:avoid"><h3>{escape(chart["title"])} (first 8 points)</h3><svg role="img" aria-label="{escape(chart["title"])}" viewBox="0 0 700 165" style="max-width:700px;width:100%">{marks}</svg></section>'
        document = f'''<!doctype html><html><head><meta charset="utf-8"><title>{escape(report['title'])}</title>
<style>body{{font:14px 'Segoe UI',Arial,sans-serif;color:#14263d;margin:24px}}h1{{font-size:24px}}p{{margin:4px 0}}table{{border-collapse:collapse;width:100%;margin:20px 0;font-size:11px}}td,th{{border:1px solid #cbd5e1;padding:6px;text-align:left;overflow-wrap:anywhere}}thead{{display:table-header-group}}tr{{break-inside:avoid}}@page{{size:A4 landscape;margin:15mm}}@media print{{a{{display:none}}}}</style></head><body><h1>Rizal Provincial Library</h1><h2>{escape(report['title'])}</h2>{info}<table>{summary}</table>{charts}{tables}</body></html>'''
        return document.encode(), 'text/html; charset=utf-8', 'html'
    output = io.BytesIO()
    styles = getSampleStyleSheet()
    styles['Normal'].fontSize = 8
    styles['Normal'].leading = 11
    doc = SimpleDocTemplate(output, pagesize=landscape(A4), leftMargin=30, rightMargin=30, topMargin=32, bottomMargin=35)
    para = lambda text: Paragraph(html.escape(display(text)), styles['Normal'])
    story = [Paragraph('Rizal Provincial Library', styles['Title']), Paragraph(html.escape(report['title']), styles['Heading2'])]
    for key, value in meta: story.append(para(f'{key}: {value}'))
    story.append(Spacer(1, 12))
    grid = [[para(key), para(value)] for key, value in report['summary'].items()]
    if grid: story.append(Table(grid, colWidths=[280, 440], style=TableStyle([('GRID', (0,0), (-1,-1), .3, colors.lightgrey), ('VALIGN', (0,0), (-1,-1), 'TOP')])))
    for chart in [c for c in report['charts'] if c['type'] != 'grouped'][:4]:
        points = chart['points'][:8]
        if not points: continue
        drawing = Drawing(700, 140)
        values = [float(p.get('value', p.get('borrowed', 0)) or 0) for p in points]
        high = max([1] + values)
        for i, (point, value) in enumerate(zip(points, values)):
            x = i * 85
            drawing.add(Rect(x, 25, 50, value / high * 85, fillColor=colors.HexColor('#2457a7'), strokeColor=None))
            drawing.add(String(x, 12, str(point['label'])[:13], fontSize=7))
            drawing.add(String(x, 115, str(value), fontSize=8))
        story += [Spacer(1, 12), Paragraph(html.escape(chart['title']) + ' (first 8 points)', styles['Heading3']), drawing]
    if rows and scope != 'summary':
        # Split wide records into manageable column groups, always repeat identity.
        groups = [columns[i:i+6] for i in range(0, len(columns), 6)]
        for index, group in enumerate(groups):
            if index and columns[0] not in group: group = [columns[0]] + group
            grid = [[para(c['label']) for c in group]] + [[para(row.get(c['key'])) for c in group] for row in rows]
            story += [Spacer(1, 12), Table(grid, repeatRows=1, colWidths=[(landscape(A4)[0]-60)/len(group)]*len(group),
                style=TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf2f7')),('GRID',(0,0),(-1,-1),.3,colors.lightgrey),('VALIGN',(0,0),(-1,-1),'TOP')]))]
    def footer(canvas, document):
        canvas.setFont('Helvetica', 8); canvas.drawString(30, 18, 'Rizal Provincial Library | Philippine time'); canvas.drawRightString(810, 18, f'Page {document.page}')
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue(), 'application/pdf', 'pdf'
