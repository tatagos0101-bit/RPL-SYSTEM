from services.report_snapshot import snapshot
import hashlib
import io
import csv
import hmac
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import ValidationError

from database import get_db
from dependencies import require_librarian
from limiter import limiter
from models.copy_acquisition import CopyAcquisition
from models.book_copy import BookCopy
from models.book import Book
from models.user import User
from schemas.reporting import ReportRequest, ReportExport, ReportFilters, AcquisitionInput, AcquisitionBatch
from services import reporting
from services.reporting_exports import export_report
from timezone_utils import now_ph, as_ph

router = APIRouter(prefix='/api/reporting', tags=['Reporting center'])


@router.get('/metadata')
def metadata(db: Session = Depends(get_db), actor=Depends(require_librarian)):
    return {'categories': reporting.CATEGORIES,
        'book_categories': [r[0] for r in db.query(Book.category).distinct().order_by(Book.category)],
        'staff': [{'id': r.id, 'label': f'Staff #{r.id}'} for r in db.query(User.id).filter(User.role == 'librarian', User.deleted_at.is_(None))],
        'max_export_rows': reporting.MAX_EXPORT, 'timezone': 'Asia/Manila'}


@router.post('/query')
@limiter.limit('30/minute')
def query(request: Request, body: ReportRequest, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    with snapshot(db) as reader:
        return reporting.report(reader, body, actor.id)


@router.post('/dashboard')
@limiter.limit('20/minute')
def dashboard(request: Request, body: ReportFilters, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    with snapshot(db) as reader:
        return reporting.dashboard(reader, body)


@router.post('/export')
@limiter.limit('5/minute')
def export(request: Request, body: ReportExport, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    with snapshot(db) as reader:
        result = reporting.report(reader, body, actor.id, export=True)
    content, mime, extension = export_report(result, body.format, body.scope)
    return Response(content, media_type=mime, headers={'Content-Disposition': f'attachment; filename="RPL-{body.filters.category}-{body.filters.start}-{body.filters.end}.{extension}"', 'Cache-Control': 'no-store'})


def version(record):
    return as_ph(record.updated_at).isoformat() if record else None


def acquisition_dict(record, copy):
    return {'copy_id': copy.id, 'copy_qr': copy.qr_code, 'title': copy.book.title,
        **{key: reporting.json_value(getattr(record, key)) if record else None for key in ('source', 'acquired_on', 'party', 'cost', 'currency', 'reference')},
        'expected_version': version(record)}


@router.get('/acquisitions/{copy_id}')
def get_acquisition(copy_id: int, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    copy = db.get(BookCopy, copy_id)
    if not copy: raise HTTPException(404, 'Physical copy not found.')
    return acquisition_dict(db.get(CopyAcquisition, copy_id), copy)


def validate_batch(db, rows, lock=False, resolve_versions=False):
    ids = [r.copy_id for r in rows]
    if len(set(ids)) != len(ids): raise HTTPException(422, 'Duplicate physical copy IDs in the import.')
    copies = db.query(BookCopy).filter(BookCopy.id.in_(ids)).order_by(BookCopy.id)
    if lock: copies = copies.with_for_update()
    found = {copy.id for copy in copies.all()}
    if found != set(ids): raise HTTPException(422, 'One or more physical copy IDs do not exist. No changes saved.')
    existing = {r.copy_id: r for r in db.query(CopyAcquisition).filter(CopyAcquisition.copy_id.in_(ids)).populate_existing().all()}
    normalized = []
    for row in rows:
        current = existing.get(row.copy_id)
        if not resolve_versions and row.expected_version != version(current):
            raise HTTPException(409, 'Acquisition metadata changed. Reload the record or preview the import again.')
        normalized.append(row.model_copy(update={'expected_version': version(current)}))
    return existing, normalized


def save_rows(db, rows, actor):
    existing, normalized = validate_batch(db, rows, lock=True)
    for row in normalized:
        record = existing.get(row.copy_id)
        if not record:
            record = CopyAcquisition(copy_id=row.copy_id, recorded_by=actor.id)
            db.add(record)
        for key, value in row.model_dump(exclude={'copy_id', 'expected_version'}).items():
            setattr(record, key, value)
        record.updated_by = actor.id
        record.updated_at = now_ph()
    db.commit()


@router.put('/acquisitions/{copy_id}')
def put_acquisition(copy_id: int, body: AcquisitionInput, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    if copy_id != body.copy_id: raise HTTPException(422, 'Copy identifier mismatch.')
    save_rows(db, [body], actor)
    return {'saved': 1}


@router.post('/acquisitions/import-preview')
async def preview_import(file: UploadFile = File(...), db: Session = Depends(get_db), actor=Depends(require_librarian)):
    raw = await file.read(1_048_577)
    if len(raw) > 1_048_576: raise HTTPException(413, 'Import must be at most 1 MB.')
    try:
        if (file.filename or '').lower().endswith('.csv'):
            reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
            if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
                raise ValueError('Use unique template column headings.')
            records = list(reader)
        elif (file.filename or '').lower().endswith('.xlsx'):
            from zipfile import ZipFile
            with ZipFile(io.BytesIO(raw)) as archive:
                if sum(info.file_size for info in archive.infolist()) > 10_000_000:
                    raise ValueError('Workbook expands beyond 10 MB.')
            from openpyxl import load_workbook
            workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=False)
            sheet = workbook.active
            values = []
            for i, cells in enumerate(sheet.iter_rows()):
                if i > 500: raise ValueError('At most 500 rows are supported.')
                if any(cell.data_type == 'f' for cell in cells): raise ValueError('Formulas are not accepted.')
                values.append([cell.value for cell in cells])
            workbook.close()
            if values and len(set(values[0])) != len(values[0]): raise ValueError('Use unique template column headings.')
            records = [dict(zip(values[0], row)) for row in values[1:]] if values else []
        else: raise ValueError('Choose a CSV or XLSX file.')
        if not records or len(records) > 500: raise ValueError('Include between 1 and 500 rows.')
        rows = []
        for index, record in enumerate(records, 2):
            cleaned = {key: value if value not in ('', None) else None for key, value in record.items()}
            if 'acquired_on' in cleaned and hasattr(cleaned['acquired_on'], 'date'): cleaned['acquired_on'] = cleaned['acquired_on'].date()
            try: rows.append(AcquisitionInput.model_validate(cleaned))
            except ValidationError: raise ValueError(f'Invalid fields on spreadsheet row {index}. Check copy_id, source, date, cost and currency.') from None
    except (ValueError, UnicodeError, OSError, KeyError, TypeError, BadZipFile):
        raise HTTPException(422, 'Invalid import. Use the template headers; include 1–500 valid rows, no formulas, and ISO dates (YYYY-MM-DD).') from None
    _, normalized = validate_batch(db, rows, resolve_versions=True)
    payload = [r.model_dump(mode='json') for r in normalized]
    token = reporting.sign_context({'actor': actor.id, 'purpose': 'acquisition-import', 'issued': now_ph().timestamp(), 'digest': hashlib.sha256(reporting.canonical(payload).encode()).hexdigest()})
    return {'rows': payload, 'preview_token': token, 'message': 'Review all rows. Apply replaces the acquisition fields on these copies; it does not change stock.'}


@router.post('/acquisitions/import-apply')
def apply_import(body: AcquisitionBatch, db: Session = Depends(get_db), actor=Depends(require_librarian)):
    if not body.preview_token: raise HTTPException(409, 'Preview this import before applying it.')
    payload = reporting.read_context(body.preview_token, actor.id, 'acquisition-import')
    digest = hashlib.sha256(reporting.canonical([r.model_dump(mode='json') for r in body.rows]).encode()).hexdigest()
    if not hmac.compare_digest(digest, payload['digest']): raise HTTPException(409, 'Import rows changed. Preview again.')
    save_rows(db, body.rows, actor)
    return {'saved': len(body.rows)}
