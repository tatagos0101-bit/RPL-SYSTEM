"""Read-only reporting projections shared by preview, dashboard and exports.

Never call inventory preparation or circulation synchronization from this module.
Every detail query selects an explicit safe projection, not ORM account objects.
"""
import base64
import hashlib
import hmac
import json
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import and_, or_, case, func, select, Date, DateTime
from sqlalchemy.orm import aliased

from config import JWT_SECRET_KEY
from models.user import User
from models.book import Book
from models.book_copy import BookCopy
from models.transaction import Transaction
from models.entry_log import EntryLog
from models.reservation import Reservation
from models.copy_acquisition import CopyAcquisition
from timezone_utils import PH_TZ, as_ph, now_ph

CATEGORIES = {
    'visits': 'Library usage', 'patrons': 'Patrons', 'circulation': 'Circulation',
    'collection': 'Collection', 'acquisitions': 'Acquisitions',
    'inventory': 'Inventory checks',
}
MAX_SCAN = 100_000
MAX_EXPORT = 20_000


def json_value(value):
    if isinstance(value, datetime):
        return as_ph(value).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def canonical(value):
    return json.dumps(value, default=json_value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def sign_context(payload):
    raw = base64.urlsafe_b64encode(canonical(payload).encode()).decode().rstrip('=')
    sig = hmac.new(JWT_SECRET_KEY.encode(), ('reporting:' + raw).encode(), 'sha256').hexdigest()
    return raw + '.' + sig


def read_context(token, actor, purpose):
    try:
        raw, sig = token.split('.')
        expected = hmac.new(JWT_SECRET_KEY.encode(), ('reporting:' + raw).encode(), 'sha256').hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError()
        payload = json.loads(base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)))
        if payload['actor'] != actor or payload['purpose'] != purpose:
            raise ValueError()
        if not 0 <= now_ph().timestamp() - payload['issued'] <= 1800:
            raise ValueError()
        return payload
    except (ValueError, KeyError, TypeError, UnicodeError):
        raise HTTPException(409, 'Report context expired or is invalid. Apply filters again.') from None


def boundaries(filters, as_of):
    start = datetime.combine(filters.start, time.min, PH_TZ)
    end = min(datetime.combine(filters.end + timedelta(days=1), time.min, PH_TZ), as_of)
    if start > end:
        raise HTTPException(422, 'Reporting periods cannot begin in the future.')
    return start, end


def previous_window(filters, as_of):
    start, end = boundaries(filters, as_of)
    nominal_end = datetime.combine(filters.end + timedelta(days=1), time.min, PH_TZ)
    if filters.period in ('month', 'last-month', 'quarter', 'year', 'last-year'):
        count = 12 if filters.period in ('year', 'last-year') else 3 if filters.period == 'quarter' else 1
        key = start.year * 12 + start.month - 1 - count
        year, month = divmod(key, 12)
        previous_start = start.replace(year=year, month=month + 1)
        previous_end = start if end >= nominal_end else min(start, previous_start + (end - start))
        comparable = end >= nominal_end or previous_end - previous_start == end - start
    else:
        previous_start = start - (nominal_end - start)
        previous_end = previous_start + (end - start)
        comparable = True
    return previous_start, previous_end, comparable


def between(column, start, end):
    return and_(column >= start, column < end)


def outstanding(as_of):
    return and_(Transaction.borrow_date <= as_of,
                or_(Transaction.return_date.is_(None), Transaction.return_date > as_of))


def overdue(as_of):
    return and_(outstanding(as_of), Transaction.due_date < as_of)


def amount(condition):
    return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)


def book_filters(query, f):
    for value, column in ((f.book_category, Book.category), (f.author, Book.author),
                          (f.isbn, Book.isbn), (f.shelf, Book.location_shelf)):
        if value:
            query = query.filter(column == value if column is Book.category else column.ilike('%' + value + '%'))
    if f.year_from is not None:
        query = query.filter(Book.year >= f.year_from)
    if f.year_to is not None:
        query = query.filter(Book.year <= f.year_to)
    return query


def projection(db, f, as_of):
    start, end = boundaries(f, as_of)
    if f.category == 'visits':
        earlier = aliased(EntryLog)
        prior = select(earlier.id).where(earlier.user_id == EntryLog.user_id,
                  earlier.granted.is_(True), earlier.accessed_at < start).exists()
        q = db.query(EntryLog.id.label('id'), EntryLog.accessed_at.label('visited'),
            EntryLog.time_out.label('departed'), EntryLog.user_id.label('visitor_key'),
            case((User.deleted_at.is_(None), User.member_id), else_=None).label('member_id'),
            EntryLog.entry_type.label('entry_method'),
            case((EntryLog.user_id.is_(None), 'unidentified'), (prior, 'returning'), else_='first recorded').label('visitor_group'))
        q = q.outerjoin(User, User.id == EntryLog.user_id).filter(EntryLog.granted.is_(True), between(EntryLog.accessed_at, start, end))
        if f.member_id: q = q.filter(User.member_id == f.member_id, User.deleted_at.is_(None))
        if f.query: q = q.filter(or_(User.member_id.ilike('%' + f.query + '%'), EntryLog.entry_type.ilike('%' + f.query + '%')))
    elif f.category == 'circulation':
        q = db.query(Transaction.id.label('id'), Transaction.book_id.label('book_id'),
            Transaction.user_id.label('patron_key'),
            case((User.deleted_at.is_(None), User.member_id), else_=None).label('member_id'),
            Book.title.label('title'), Book.author.label('author'), Book.category.label('category'),
            BookCopy.qr_code.label('copy_qr'), Transaction.borrow_date.label('borrowed'),
            Transaction.return_date.label('returned'), Transaction.due_date.label('due'),
            case((Transaction.return_date <= as_of, 'returned'), (overdue(as_of), 'overdue'), else_='outstanding').label('status'))
        q = q.join(Book, Book.id == Transaction.book_id).join(User, User.id == Transaction.user_id).outerjoin(BookCopy, BookCopy.id == Transaction.copy_id)
        if f.loan_status in ('outstanding', 'overdue'):
            # Current snapshot drill-down: date range is explicitly not a borrow-date restriction.
            q = q.filter(overdue(as_of) if f.loan_status == 'overdue' else outstanding(as_of))
        else:
            basis = {'borrowed': Transaction.borrow_date, 'returned': Transaction.return_date, 'due': Transaction.due_date}.get(f.date_basis)
            q = q.filter(between(basis, start, end) if basis is not None else or_(between(Transaction.borrow_date, start, end), between(Transaction.return_date, start, end)))
            if f.loan_status == 'returned': q = q.filter(Transaction.return_date <= as_of)
            if f.loan_status in ('on-time', 'late'):
                q = q.filter(Transaction.return_date <= as_of, Transaction.due_date.isnot(None),
                    Transaction.return_date <= Transaction.due_date if f.loan_status == 'on-time' else Transaction.return_date > Transaction.due_date)
        q = book_filters(q, f)
        if f.member_id: q = q.filter(User.member_id == f.member_id, User.deleted_at.is_(None))
        if f.qr: q = q.filter(or_(BookCopy.qr_code == f.qr, Book.qr_code == f.qr))
        if f.query: q = q.filter(or_(Book.title.ilike('%' + f.query + '%'), Book.author.ilike('%' + f.query + '%'), User.member_id.ilike('%' + f.query + '%')))
    elif f.category == 'patrons':
        borrow_totals = db.query(Transaction.user_id, func.count().label('count')).filter(between(Transaction.borrow_date, start, end)).group_by(Transaction.user_id).subquery()
        visit_totals = db.query(EntryLog.user_id, func.count().label('count')).filter(EntryLog.granted.is_(True), between(EntryLog.accessed_at, start, end)).group_by(EntryLog.user_id).subquery()
        borrows = func.coalesce(borrow_totals.c.count, 0)
        visits = func.coalesce(visit_totals.c.count, 0)
        q = db.query(User.id.label('id'), User.member_id.label('member_id'), User.created_at.label('registered'),
            User.status.label('account_status'), borrows.label('borrows'), visits.label('visits'))
        q = q.outerjoin(borrow_totals, borrow_totals.c.user_id == User.id).outerjoin(visit_totals, visit_totals.c.user_id == User.id)
        q = q.filter(User.role == 'member', User.deleted_at.is_(None), User.created_at <= as_of)
        if f.date_scope == 'period': q = q.filter(between(User.created_at, start, end))
        if f.account_status: q = q.filter(User.status == f.account_status)
        if f.member_id: q = q.filter(User.member_id == f.member_id)
        if f.query: q = q.filter(User.member_id.ilike('%' + f.query + '%'))
        if f.participation == 'borrowed': q = q.filter(borrows > 0)
        if f.participation == 'visited': q = q.filter(visits > 0)
        if f.participation == 'neither': q = q.filter(borrows == 0, visits == 0)
    elif f.category in ('collection', 'acquisitions'):
        borrow_totals = db.query(Transaction.book_id, func.count().label('count')).filter(between(Transaction.borrow_date, start, end)).group_by(Transaction.book_id).subquery()
        borrow_count = func.coalesce(borrow_totals.c.count, 0)
        columns = [(func.coalesce(BookCopy.id, -Book.id) if f.category == 'collection' else BookCopy.id).label('id'), Book.id.label('book_id'), Book.title.label('title'), Book.author.label('author'),
            Book.category.label('category'), Book.year.label('publication_year'), Book.isbn.label('isbn'), Book.location_shelf.label('shelf'),
            BookCopy.qr_code.label('copy_qr'), BookCopy.status.label('copy_status'), BookCopy.created_at.label('copy_recorded'), Book.created_at.label('title_recorded')]
        if f.category == 'acquisitions':
            columns += [func.coalesce(CopyAcquisition.source, 'unknown').label('source'), CopyAcquisition.acquired_on.label('acquired'),
                CopyAcquisition.party.label('donor_supplier'), CopyAcquisition.cost.label('cost'), CopyAcquisition.currency.label('currency'),
                CopyAcquisition.reference.label('reference'), CopyAcquisition.recorded_by.label('recorded_by'), CopyAcquisition.updated_by.label('updated_by'),
                CopyAcquisition.updated_at.label('version')]
        else: columns += [borrow_count.label('title_borrows')]
        q = db.query(*columns).select_from(Book).outerjoin(BookCopy, BookCopy.book_id == Book.id) if f.category == 'collection' else db.query(*columns).join(Book, Book.id == BookCopy.book_id)
        if f.category == 'acquisitions':
            q = q.outerjoin(CopyAcquisition, CopyAcquisition.copy_id == BookCopy.id)
            if f.date_scope == 'period': q = q.filter(CopyAcquisition.acquired_on >= f.start, CopyAcquisition.acquired_on <= min(f.end, as_of.date()))
            if f.date_scope == 'unknown': q = q.filter(CopyAcquisition.acquired_on.is_(None))
            if f.source: q = q.filter(CopyAcquisition.source.is_(None) if f.source == 'unknown' else CopyAcquisition.source == f.source)
            if f.party: q = q.filter(CopyAcquisition.party.ilike('%' + f.party + '%'))
            if f.recorded_by: q = q.filter(CopyAcquisition.recorded_by == f.recorded_by)
        else:
            q = q.outerjoin(borrow_totals, borrow_totals.c.book_id == Book.id)
            if f.date_scope == 'period': q = q.filter(between(Book.created_at, start, end))
            if f.copy_status: q = q.filter(BookCopy.status == f.copy_status)
            if f.holdings == 'current': q = q.filter(BookCopy.status != 'retired')
        q = book_filters(q, f)
        if f.qr: q = q.filter(or_(BookCopy.qr_code == f.qr, Book.qr_code == f.qr))
        if f.query: q = q.filter(or_(Book.title.ilike('%' + f.query + '%'), Book.author.ilike('%' + f.query + '%'), BookCopy.qr_code.ilike('%' + f.query + '%')))
    else:  # inventory reconciliation (one row per title, never a repair)
        copy_totals = db.query(BookCopy.book_id, amount(BookCopy.status != 'retired').label('held'),
            amount(BookCopy.status == 'available').label('available'), amount(BookCopy.status == 'borrowed').label('borrowed')).group_by(BookCopy.book_id).subquery()
        loan_totals = db.query(Transaction.book_id, func.count().label('count')).filter(outstanding(as_of)).group_by(Transaction.book_id).subquery()
        held, available, borrowed = [func.coalesce(copy_totals.c[key], 0) for key in ('held', 'available', 'borrowed')]
        loans = func.coalesce(loan_totals.c.count, 0)
        q = db.query(Book.id.label('id'), Book.title.label('title'), Book.category.label('category'), Book.copies_total.label('declared_copies'),
            held.label('physical_copies'), Book.copies_available.label('declared_available'), available.label('available'),
            borrowed.label('borrowed_copies'), loans.label('outstanding_loans'),
            case((or_(held != Book.copies_total, available != Book.copies_available, borrowed != loans), 1), else_=0).label('discrepancy'))
        q = q.outerjoin(copy_totals, copy_totals.c.book_id == Book.id).outerjoin(loan_totals, loan_totals.c.book_id == Book.id)
        q = book_filters(q, f)
        if f.qr: q = q.filter(or_(Book.qr_code == f.qr, select(BookCopy.id).where(BookCopy.book_id == Book.id, BookCopy.qr_code == f.qr).exists()))
        if f.query: q = q.filter(Book.title.ilike('%' + f.query + '%'))
    return q


def bucket(db, column, group):
    if db.bind.dialect.name == 'postgresql':
        local = column if isinstance(column.type, Date) and not isinstance(column.type, DateTime) else func.timezone('Asia/Manila', column)
        return func.to_char(func.date_trunc(group, local), 'YYYY-MM-DD')
    if group == 'week': return func.date(column, '-6 days', 'weekday 1')
    return func.strftime({'day': '%Y-%m-%d', 'month': '%Y-%m-01', 'year': '%Y-01-01'}[group], column)


def series(db, sub, column, f, value=None, as_of=None):
    start, end = boundaries(f, as_of or now_ph())
    key = bucket(db, column, f.group)
    q = db.query(key.label('label'), (value if value is not None else func.count()).label('value')).select_from(sub)
    date_only = isinstance(column.type, Date) and not isinstance(column.type, DateTime)
    q = q.filter(and_(column >= f.start, column <= min(f.end, end.date())) if date_only else between(column, start, end)).group_by(key).order_by(key)
    found = {row.label: float(row.value or 0) for row in q.all()}
    cursor = start.date()
    if f.group == 'week': cursor -= timedelta(days=cursor.weekday())
    if f.group == 'month': cursor = cursor.replace(day=1)
    if f.group == 'year': cursor = cursor.replace(month=1, day=1)
    last = min(f.end, end.date() if date_only else (end - timedelta(microseconds=1)).date())
    result = []
    while cursor <= last:
        result.append({'label': cursor.isoformat(), 'value': found.get(cursor.isoformat(), 0)})
        if len(result) > 400: raise HTTPException(422, 'Choose a coarser chart grouping for this date range (at most 400 intervals).')
        if f.group == 'year': cursor = cursor.replace(year=cursor.year + 1)
        elif f.group == 'month':
            key = cursor.year * 12 + cursor.month
            year, month = divmod(key, 12)
            cursor = cursor.replace(year=year, month=month + 1)
        else: cursor += timedelta(days=7 if f.group == 'week' else 1)
    return result


def grouped(db, sub, label, value=None, limit=20, ascending=False):
    metric = value if value is not None else func.count()
    return [{'label': str(row[0] or 'Unknown'), 'value': float(row[1] or 0)} for row in
        db.query(label, metric).select_from(sub).group_by(label).order_by(metric.asc() if ascending else metric.desc(), label).limit(limit).all()]


def analyze(db, f, as_of, sub):
    c = sub.c
    summary = {'matching_records': db.query(func.count()).select_from(sub).scalar() or 0}
    charts = []
    if f.category == 'visits':
        summary.update(identified_unique_visitors=db.query(func.count(func.distinct(c.visitor_key))).scalar() or 0,
            unidentified_visits=db.query(amount(c.visitor_key.is_(None))).scalar() or 0,
            returning_visitors=db.query(func.count(func.distinct(case((c.visitor_group == 'returning', c.visitor_key))))).scalar() or 0,
            first_recorded_visitors=db.query(func.count(func.distinct(case((c.visitor_group == 'first recorded', c.visitor_key))))).scalar() or 0)
        start, end = boundaries(f, as_of)
        summary['average_visits_per_calendar_day'] = round(summary['matching_records'] / max(1, (end.date() - start.date()).days + (end.time() != time.min)), 2)
        pstart, pend, comparable = previous_window(f, as_of)
        previous = projection(db, f.model_copy(update={'start':pstart.date(), 'end':(pend-timedelta(microseconds=1)).date()}), pend).subquery()
        prior_count = db.query(func.count()).select_from(previous).scalar()
        summary.update(previous_period_visits=prior_count, visits_change_percent=round((summary['matching_records']-prior_count)/prior_count*100, 1) if prior_count and comparable else None)
        local = func.timezone('Asia/Manila', c.visited) if db.bind.dialect.name == 'postgresql' else c.visited
        hour = func.to_char(local, 'HH24') if db.bind.dialect.name == 'postgresql' else func.strftime('%H', local)
        weekday = func.to_char(local, 'Dy') if db.bind.dialect.name == 'postgresql' else func.strftime('%w', local)
        charts = [chart('visitors', 'Recorded visits', series(db, sub, c.visited, f, as_of=as_of), 'line'),
            chart('hours', 'Peak visiting hours (Philippine time)', grouped(db, sub, hour, limit=24)),
            chart('days', 'Peak weekdays', [{**r, 'label': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][int(r['label'])] if r['label'].isdigit() else r['label']} for r in grouped(db, sub, weekday, limit=7)])]
    elif f.category == 'circulation':
        start, end = boundaries(f, as_of)
        duration = (func.extract('epoch', c.returned - c.borrowed) / 86400 if db.bind.dialect.name == 'postgresql'
                    else func.julianday(c.returned) - func.julianday(c.borrowed))
        returned = between(c.returned, start, end)
        valid = and_(returned, c.borrowed.isnot(None), c.returned >= c.borrowed)
        average_duration = db.query(func.avg(case((valid, duration)))).scalar()
        summary.update(borrows=db.query(amount(between(c.borrowed, start, end))).scalar(),
            returns=db.query(amount(between(c.returned, start, end))).scalar(),
            on_time_returns=db.query(amount(and_(returned, c.returned <= c.due))).scalar(),
            late_returns=db.query(amount(and_(returned, c.returned > c.due))).scalar(),
            average_loan_days=round(float(average_duration), 2) if average_duration is not None else None,
            excluded_duration_rows=db.query(amount(and_(returned, or_(c.borrowed.is_(None), c.returned < c.borrowed)))).scalar(),
            unknown_due_date_returns=db.query(amount(and_(returned, c.due.is_(None)))).scalar())
        charts = [chart('borrows', 'Books borrowed', series(db, sub, c.borrowed, f, as_of=as_of), 'line'),
                  chart('returns', 'Books returned', series(db, sub, c.returned, f, as_of=as_of), 'line'),
                  chart('categories', 'Borrowing by current category', grouped(db, sub, c.category, amount(between(c.borrowed, start, end))), 'donut'),
                  chart('titles', 'Most borrowed titles', grouped(db, sub, c.title, amount(between(c.borrowed, start, end)))),
                  chart('authors', 'Most borrowed authors', grouped(db, sub, c.author, amount(between(c.borrowed, start, end))))]
        title_rows = db.query(c.book_id, c.title, amount(between(c.borrowed, start, end)).label('count')).group_by(c.book_id, c.title).order_by(amount(between(c.borrowed, start, end)).desc(), c.book_id).limit(20).all()
        next(item for item in charts if item['id'] == 'titles')['points'] = [{'label': f'{r.title} [#{r.book_id}]', 'value': r.count} for r in title_rows]
        by_key = {}
        for name in ('borrows', 'returns'):
            for row in next(item for item in charts if item['id'] == name)['points']:
                by_key.setdefault(row['label'], {'label': row['label'], 'borrowed': 0, 'returned': 0})['borrowed' if name == 'borrows' else 'returned'] = row['value']
        charts.insert(0, {'id': 'comparison', 'title': 'Borrowed and returned', 'type': 'grouped', 'points': [by_key[key] for key in sorted(by_key)]})
    elif f.category == 'patrons':
        summary.update(borrowed_in_period=db.query(amount(c.borrows > 0)).scalar(), visited_in_period=db.query(amount(c.visits > 0)).scalar(), registrations_in_period=db.query(amount(between(c.registered, *boundaries(f, as_of)))).scalar())
        charts = [chart('registrations', 'Registration dates of matching patrons', series(db, sub, c.registered, f, as_of=as_of), 'line'),
                  chart('accounts', 'Account status', grouped(db, sub, c.account_status), 'donut')]
        top = db.query(c.member_id, c.borrows).order_by(c.borrows.desc(), c.id).limit(10).all()
        charts.append(chart('borrowers', 'Most active borrowers (member identifiers)', [{'label': r[0], 'value': r[1]} for r in top]))
    elif f.category == 'collection':
        summary.update(titles=db.query(func.count(func.distinct(c.book_id))).scalar(),
            physical_copy_records=db.query(amount(c.copy_status.isnot(None))).scalar(), current_holdings=db.query(amount(c.copy_status != 'retired')).scalar(), retired=db.query(amount(c.copy_status == 'retired')).scalar())
        titles = db.query(c.book_id, c.title, c.author, c.category, c.title_borrows).distinct().subquery()
        charts = [chart('statuses', 'Physical copy status', grouped(db, sub, c.copy_status, amount(c.copy_status.isnot(None))), 'donut'),
            chart('category-copies', 'Copies by category', grouped(db, sub, c.category, amount(c.copy_status.isnot(None)))),
            chart('category-titles', 'Titles by category', grouped(db, titles, titles.c.category)),
            chart('popular-categories', 'Category borrowing in period', grouped(db, titles, titles.c.category, func.sum(titles.c.title_borrows))),
            chart('least-categories', 'Least used categories in period', grouped(db, titles, titles.c.category, func.sum(titles.c.title_borrows), ascending=True))]
        for ascending, label in [(False, 'Most borrowed titles'), (True, 'Least borrowed titles (including zero)')]:
            rows = db.query(titles.c.book_id, titles.c.title, titles.c.title_borrows).order_by(titles.c.title_borrows.asc() if ascending else titles.c.title_borrows.desc(), titles.c.book_id).limit(10).all()
            charts.append(chart('least' if ascending else 'most', label, [{'label': f'{r.title} [#{r.book_id}]', 'value': r.title_borrows} for r in rows]))
    elif f.category == 'acquisitions':
        coverage_q = book_filters(db.query(BookCopy.id, CopyAcquisition.source, CopyAcquisition.acquired_on).join(Book).outerjoin(CopyAcquisition), f).subquery()
        summary.update(coverage_copies=db.query(func.count()).select_from(coverage_q).scalar(),
            coverage_unknown_source=db.query(amount(coverage_q.c.source.is_(None))).scalar(),
            coverage_unknown_date=db.query(amount(coverage_q.c.acquired_on.is_(None))).scalar())
        charts = [chart('source', 'Acquisition sources', grouped(db, sub, c.source), 'donut'),
                  chart('acquired', 'Acquired copies by month', series(db, sub, c.acquired, f.model_copy(update={'group': 'month'}), as_of=as_of), 'bar'),
                  chart('acquisition-category', 'Acquisitions by category', grouped(db, sub, c.category))]
        summary['recorded_cost_by_currency'] = ', '.join(f'{row[0]} {row[1]}' for row in db.query(c.currency, func.sum(c.cost)).filter(c.cost.isnot(None)).group_by(c.currency).all()) or 'Not recorded'
    elif f.category == 'inventory':
        summary['discrepant_titles'] = db.query(amount(c.discrepancy == 1)).scalar()
        charts = [chart('discrepancies', 'Inventory reconciliation', [{'label': 'Needs review', 'value': summary['discrepant_titles']}, {'label': 'Counts agree', 'value': summary['matching_records'] - summary['discrepant_titles']}], 'donut')]
    return summary, charts


def chart(key, title, points, kind='bar'):
    return {'id': key, 'title': title, 'type': kind, 'points': points}


def encode_rows(rows):
    return [{key: json_value(value) for key, value in row._mapping.items()} for row in rows]


def report(db, request, actor, export=False):
    f = request.filters
    old = read_context(request.context, actor, 'report') if request.context else None
    if export and not old:
        raise HTTPException(409, 'Apply filters before exporting.')
    fh = hashlib.sha256(canonical(f.model_dump(mode='json')).encode()).hexdigest()
    if old and old['filter'] != fh:
        raise HTTPException(409, 'Filters changed. Apply filters again.')
    as_of = datetime.fromisoformat(old['as_of']) if old else now_ph()
    sub = projection(db, f, as_of).subquery()
    if db.query(func.count()).select_from(sub).scalar() > MAX_SCAN:
        raise HTTPException(422, 'This report is too large. Narrow the filters; no partial result was generated.')
    summary, charts = analyze(db, f, as_of, sub)
    total = summary['matching_records']
    if total > MAX_SCAN or (export and request.scope == 'all' and total > MAX_EXPORT):
        raise HTTPException(422, 'This report is too large. Narrow the filters; no partial result was generated.')
    # Hash the full safe projection in bounded batches. This detects edits as well
    # as inserts/deletes, unlike an as-of timestamp or MAX(id) token.
    digest = hashlib.sha256(canonical({'summary': summary, 'charts': charts}).encode())
    for row in db.query(sub).order_by(sub.c.id).yield_per(500):
        digest.update(canonical(dict(row._mapping)).encode())
    version = digest.hexdigest()
    if old and old['digest'] != version:
        raise HTTPException(409, 'Records changed since this preview. Apply filters again before paging or exporting.')
    token = sign_context({'actor': actor, 'purpose': 'report', 'issued': old['issued'] if old else now_ph().timestamp(), 'filter': fh, 'as_of': as_of.isoformat(), 'digest': version})
    if f.sort not in sub.c.keys() or f.sort in ('visitor_key', 'patron_key'):
        raise HTTPException(422, 'Unsupported sort field for this report.')
    order = sub.c[f.sort].asc() if f.direction == 'asc' else sub.c[f.sort].desc()
    query = db.query(sub).order_by(order, sub.c.id)
    if not export or request.scope == 'page': query = query.offset(request.page * request.page_size).limit(request.page_size)
    rows = [] if export and request.scope == 'summary' else encode_rows(query.all())
    columns = [{'key': key, 'label': key.replace('_', ' ').title()} for key in sub.c.keys() if key not in ('visitor_key', 'patron_key')]
    rows = [{c['key']: row[c['key']] for c in columns} for row in rows]
    return {'title': CATEGORIES[f.category], 'filters': f.model_dump(mode='json'), 'as_of': as_of.isoformat(), 'context': token,
        'summary': summary, 'charts': charts, 'total': total, 'columns': columns, 'rows': rows,
        'notes': notes(f)}


def notes(f):
    text = ['Philippine time. Period start is inclusive; the following midnight is exclusive.',
            'Historical category/author breakdowns use current catalog metadata. Missing source data is not zero.']
    if f.category == 'visits': text += ['Visits are granted recorded sessions, not camera detections. First recorded does not establish first-ever attendance. Historical source errors cannot be reconstructed.', 'Comparison uses the preceding calendar period or matching elapsed portion. An unavailable percentage means no percentage baseline or unequal coverage; it is not zero.']
    if f.category == 'circulation': text += ['Timeliness and mean duration describe valid returns in this period. Open loans are not completed durations; invalid return/borrow pairs are excluded and counted.']
    if f.category == 'collection': text += ['Rows include catalog titles with no copy records; their copy fields are Not recorded. Copy record creation is not acquisition. Titles are catalog IDs; different editions may share a name. Retired copies are listed separately from current holdings.']
    if f.category == 'acquisitions': text += ['Coverage counts use the catalog filters across all copies, independently of acquisition-date/source filters. Unknown dates do not enter dated acquisition totals.']
    if f.loan_status in ('outstanding', 'overdue'): text += ['Outstanding/overdue is an as-of snapshot, not restricted by borrowing period.']
    return text


def metric_bundle(db, f, as_of):
    """The same projections/aggregations power dashboard, reports and monthly PDFs."""
    data = {}
    for category, updates in [('visits', {}), ('circulation', {'date_basis': 'activity'}),
        ('collection', {'date_scope': 'all'}), ('acquisitions', {}), ('inventory', {})]:
        local = f.model_copy(update={'category': category, **updates})
        sub = projection(db, local, as_of).subquery()
        data[category] = analyze(db, local, as_of, sub)
    start, end = boundaries(f, as_of)
    totals = {
        'registered_patrons': db.query(func.count(User.id)).filter(User.role == 'member', User.deleted_at.is_(None), User.created_at <= as_of).scalar(),
        'visits_today': db.query(func.count(EntryLog.id)).filter(EntryLog.granted.is_(True), between(EntryLog.accessed_at, as_of.replace(hour=0, minute=0, second=0, microsecond=0), as_of)).scalar(),
        'unique_visitors': data['visits'][0]['identified_unique_visitors'],
        'currently_borrowed': db.query(func.count(Transaction.id)).filter(outstanding(as_of)).scalar(),
        'borrows': data['circulation'][0]['borrows'], 'returns': data['circulation'][0]['returns'],
        'overdue': db.query(func.count(Transaction.id)).filter(overdue(as_of)).scalar(),
        'titles': db.query(func.count(Book.id)).scalar(),
        'physical_copies': data['collection'][0]['current_holdings'],
        'acquired_copies': data['acquisitions'][0]['matching_records'],
        'new_catalog_titles': db.query(func.count(Book.id)).filter(between(Book.created_at, start, end)).scalar(),
    }
    return totals, data


def dashboard(db, f, as_of=None):
    as_of = as_of or now_ph()
    # Dashboard accepts period/group only: do not silently ignore extra filters.
    if any(value not in ('', None) for value in (f.query, f.book_category, f.author, f.isbn, f.qr, f.shelf, f.member_id, f.account_status, f.participation, f.loan_status, f.copy_status, f.source, f.party, f.recorded_by, f.year_from, f.year_to)):
        raise HTTPException(422, 'Dashboard accepts date and grouping filters only.')
    totals, data = metric_bundle(db, f, as_of)
    pstart, pend, comparable = previous_window(f, as_of)
    # Exact time range for partial-period comparisons, rather than previous full months.
    comparisons = {}
    for key, model, column, extra in [
        ('borrows', Transaction, Transaction.borrow_date, []), ('returns', Transaction, Transaction.return_date, []),
        ('unique_visitors', EntryLog, EntryLog.accessed_at, [EntryLog.granted.is_(True)]),
        ('acquired_copies', CopyAcquisition, CopyAcquisition.acquired_on, []),
    ]:
        count = func.count(func.distinct(EntryLog.user_id)) if key == 'unique_visitors' else func.count()
        if key == 'acquired_copies':
            # Date-only acquisition records cannot support a partial-day comparison.
            prev = db.query(count).select_from(model).filter(column >= pstart.date(), column < pend.date()).scalar()
            comparison_ok = comparable and datetime.combine(f.end + timedelta(days=1), time.min, PH_TZ) <= as_of
        else:
            prev = db.query(count).select_from(model).filter(between(column, pstart, pend), *extra).scalar()
            comparison_ok = comparable
        comparisons[key] = {'previous': prev, 'delta': totals[key] - prev if comparison_ok else None,
            'percent': round((totals[key] - prev) / prev * 100, 1) if prev and comparison_ok else None}
    # Visitor comparison series comes from the same attendance projection.
    pf = f.model_copy(update={'category': 'visits', 'start': pstart.date(), 'end': (pend - timedelta(microseconds=1)).date()})
    previous_visits = projection(db, pf, pend).subquery()
    comparison_visits = series(db, previous_visits, previous_visits.c.visited, pf, as_of=pend)
    due_today = db.query(func.count(Transaction.id)).filter(outstanding(as_of),
        between(Transaction.due_date, as_of.replace(hour=0, minute=0, second=0, microsecond=0), as_of.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1))).scalar()
    ready = db.query(func.count(Reservation.id)).filter(Reservation.status == 'ready', or_(Reservation.expires_at.is_(None), Reservation.expires_at > as_of)).scalar()
    alerts = [
        {'label': 'Overdue loans', 'count': totals['overdue'], 'href': '/librarian/due-books'},
        {'label': 'Loans due today', 'count': due_today, 'href': '/librarian/due-books'},
        {'label': 'Ready title-level reservations (not assigned copies)', 'count': ready, 'href': '/librarian/reservations'},
        {'label': 'Recorded damaged or lost copies', 'count': db.query(func.count(BookCopy.id)).filter(BookCopy.status.in_(['damaged', 'lost'])).scalar(), 'href': '/librarian/inventory'},
        {'label': 'Inventory count discrepancies', 'count': data['inventory'][0]['discrepant_titles'], 'href': '/librarian/reports?category=inventory'},
    ]
    recent = []
    for column, label in [(Transaction.borrow_date, 'Borrowed'), (Transaction.return_date, 'Returned')]:
        for row in db.query(Transaction.id, column, Book.title).join(Book).filter(column.isnot(None), column <= as_of).order_by(column.desc(), Transaction.id.desc()).limit(5):
            recent.append({'id': f'{label}-{row[0]}', 'at': json_value(row[1]), 'label': f'{label}: {row[2]}'})
    for row in db.query(Book.id, Book.title, Book.created_at).order_by(Book.created_at.desc(), Book.id.desc()).limit(3):
        recent.append({'id': f'book-{row.id}', 'at': json_value(row.created_at), 'label': f'Cataloged: {row.title}'})
    for row in db.query(User.id, User.created_at).filter(User.role == 'member', User.deleted_at.is_(None)).order_by(User.created_at.desc(), User.id.desc()).limit(3):
        recent.append({'id': f'patron-{row.id}', 'at': json_value(row.created_at), 'label': 'New patron registered'})
    for row in db.query(CopyAcquisition.copy_id, CopyAcquisition.created_at, CopyAcquisition.source).order_by(CopyAcquisition.created_at.desc()).limit(3):
        recent.append({'id': f'acquisition-{row.copy_id}', 'at': json_value(row.created_at), 'label': f'Acquisition recorded: copy #{row.copy_id} ({row.source or "unknown"})'})
    return {'as_of': as_of.isoformat(), 'filters': f.model_dump(mode='json'), 'metrics': totals, 'comparisons': comparisons,
        'comparison_period': {'start': pstart.isoformat(), 'end': pend.isoformat(), 'comparable': comparable},
        'previous_visits': comparison_visits, 'sections': {key: {'summary': value[0], 'charts': value[1]} for key, value in data.items()},
        'alerts': alerts, 'recent': sorted(recent, key=lambda row: row['at'] or '', reverse=True)[:12]}
