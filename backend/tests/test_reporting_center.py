import io
from datetime import datetime, timedelta
from zipfile import ZipFile
import pytest
from openpyxl import load_workbook
from pypdf import PdfReader
from models.book import Book
from models.book_copy import BookCopy
from models.entry_log import EntryLog
from models.transaction import Transaction
from models.user import User
from models.copy_acquisition import CopyAcquisition
from routers.auth import _hash, _make_token
from timezone_utils import PH_TZ, now_ph
from services import reporting


@pytest.fixture()
def report_data(client, db_session, monkeypatch):
    now = datetime(2026, 11, 4, 12, tzinfo=PH_TZ)
    monkeypatch.setattr(reporting, 'now_ph', lambda: now)
    monkeypatch.setattr('routers.reporting.now_ph', lambda: now)
    staff = User(name='Synthetic Staff', member_id='SYN-STAFF', role='librarian', password_hash=_hash('ReportTest1'), created_at=now-timedelta(days=60))
    member = User(name='Synthetic Member', member_id='SYN-MEMBER', role='member', password_hash=_hash('ReportTest1'), created_at=now-timedelta(days=60))
    db_session.add_all([staff, member]); db_session.flush()
    book = Book(title='=Dangerous title', author='Synthetic Author', category='Literature', year=2020, copies_total=3, copies_available=2, created_at=now-timedelta(days=60))
    unused = Book(title='Unread book', author='Synthetic Author', category='History', year=2018, copies_total=1, copies_available=1, created_at=now-timedelta(days=60))
    db_session.add_all([book, unused]); db_session.flush()
    copies = [BookCopy(book_id=book.id, copy_number=i+1, qr_code=f'SYN-COPY-{i}', status='borrowed' if i==0 else 'available') for i in range(3)]
    copies += [BookCopy(book_id=unused.id, copy_number=1, qr_code='SYN-UNREAD', status='available')]
    db_session.add_all(copies); db_session.flush()
    db_session.add_all([
        Transaction(user_id=member.id, book_id=book.id, copy_id=copies[0].id, type='borrow', status='active', borrow_date=datetime(2026,10,1,tzinfo=PH_TZ), due_date=datetime(2026,10,15,tzinfo=PH_TZ)),
        Transaction(user_id=member.id, book_id=book.id, copy_id=copies[1].id, type='return', status='returned', borrow_date=datetime(2026,11,1,tzinfo=PH_TZ), return_date=datetime(2026,11,2,tzinfo=PH_TZ), due_date=datetime(2026,11,15,tzinfo=PH_TZ)),
        EntryLog(user_id=member.id, granted=True, accessed_at=datetime(2026,10,1,tzinfo=PH_TZ)),
        EntryLog(user_id=member.id, granted=True, accessed_at=datetime(2026,11,1,tzinfo=PH_TZ)),
        EntryLog(user_id=member.id, granted=True, accessed_at=datetime(2026,11,2,tzinfo=PH_TZ)),
        EntryLog(user_id=None, granted=True, accessed_at=datetime(2026,11,2,tzinfo=PH_TZ)),
        EntryLog(user_id=None, granted=False, accessed_at=datetime(2026,11,2,tzinfo=PH_TZ)),
    ])
    db_session.commit()
    return {'staff': {'Authorization': 'Bearer '+_make_token(staff.id)}, 'member': {'Authorization': 'Bearer '+_make_token(member.id)}, 'copies': copies, 'book': book, 'staff_id': staff.id, 'member_id': member.id}


def filters(category='circulation', **kwargs):
    return {'category': category, 'start': '2026-11-01', 'end': '2026-11-30', 'period': 'month', **kwargs}


def query(client, data, category='circulation', **kwargs):
    response = client.post('/api/reporting/query', json={'filters': filters(category, **kwargs)}, headers=data['staff'])
    assert response.status_code == 200, response.text
    return response.json()


def test_shared_counts_and_read_only_dashboard(client, db_session, report_data):
    body = filters()
    response = client.post('/api/reporting/dashboard', json=body, headers=report_data['staff'])
    assert response.status_code == 200, response.text
    metrics = response.json()['metrics']
    assert metrics['borrows'] == metrics['returns'] == 1
    assert metrics['overdue'] == metrics['currently_borrowed'] == 1
    assert metrics['titles'] == 2 and metrics['physical_copies'] == 4
    visits = query(client, report_data, 'visits')
    assert visits['total'] == 3 and visits['summary']['identified_unique_visitors'] == 1
    assert visits['summary']['returning_visitors'] == 1
    assert visits['summary']['unidentified_visits'] == 1
    assert metrics['unique_visitors'] == visits['summary']['identified_unique_visitors']
    circulation = query(client, report_data)
    assert circulation['summary']['borrows'] == metrics['borrows']
    assert circulation['summary']['returns'] == metrics['returns']
    assert circulation['summary']['on_time_returns'] == 1
    assert db_session.query(Transaction).filter(Transaction.status=='overdue').count()==0
    collection = query(client, report_data, 'collection', date_scope='all')
    assert collection['summary']['titles']==2 and collection['total']==4
    assert next(c for c in collection['charts'] if c['id']=='least')['points'][0]['value']==0


def test_all_categories_and_combined_filters(client, report_data):
    for category in ['patrons', 'collection', 'inventory', 'acquisitions']:
        query(client, report_data, category)
    result=query(client, report_data, 'collection', date_scope='all', author='Synthetic', year_from=2019, year_to=2025)
    assert result['total']==3 and result['summary']['titles']==1
    assert query(client, report_data, 'circulation', book_category='History')['total']==0
    response=client.post('/api/reporting/query',json={'filters':filters('visits',source='donated')},headers=report_data['staff'])
    assert response.status_code==422


def test_stale_context_detects_edits_and_authorization(client, db_session, report_data):
    result=query(client, report_data)
    payload={'filters':filters(), 'context':result['context'], 'format':'csv'}
    assert client.post('/api/reporting/export',json=payload,headers=report_data['member']).status_code==403
    assert client.post('/api/reporting/export',json=payload).status_code==401
    report_data['book'].title='Changed title';db_session.commit()
    assert client.post('/api/reporting/export',json=payload,headers=report_data['staff']).status_code==409
    assert client.post('/api/reporting/query',json={'filters':filters(), 'context':result['context'],'page':1},headers=report_data['staff']).status_code==409


def test_exports_share_preview_and_escape_untrusted_cells(client, report_data):
    result=query(client, report_data)
    base={'filters':filters(), 'context':result['context']}
    for format in ['csv','xlsx','pdf','print']:
        response=client.post('/api/reporting/export',json={**base,'format':format},headers=report_data['staff'])
        assert response.status_code==200,response.text[:200]
        if format=='csv':
            with ZipFile(io.BytesIO(response.content)) as archive:
                assert "'=Dangerous title" in archive.read('records.csv').decode('utf-8-sig')
                assert 'Filter: start: 2026-11-01' in archive.read('report-metadata.txt').decode()
        if format=='xlsx':
            workbook=load_workbook(io.BytesIO(response.content));assert set(workbook.sheetnames)=={'Report information','Summary','Records'}
            assert any(cell.value=='=Dangerous title' and cell.data_type=='s' for row in workbook['Records'] for cell in row)
        if format=='pdf': assert 'Rizal Provincial Library' in PdfReader(io.BytesIO(response.content)).pages[0].extract_text()
        if format=='print': assert '2026-11-01' in response.text


def test_acquisitions_unknown_and_concurrent_edit(client, db_session, report_data):
    before=query(client,report_data,'acquisitions',date_scope='all')
    assert before['summary']['coverage_unknown_date']==4
    copy=report_data['copies'][0]
    body={'copy_id':copy.id,'source':'donated','acquired_on':'2026-11-01','reference':'Synthetic review'}
    response=client.put(f'/api/reporting/acquisitions/{copy.id}',json=body,headers=report_data['staff']);assert response.status_code==200,response.text
    record=client.get(f'/api/reporting/acquisitions/{copy.id}',headers=report_data['staff']).json()
    assert record['expected_version']
    assert client.put(f'/api/reporting/acquisitions/{copy.id}',json=body,headers=report_data['staff']).status_code==409
    result=query(client,report_data,'acquisitions',source='donated')
    assert result['total']==1 and result['summary']['coverage_unknown_date']==3
    assert result['charts'][1]['points'][0]['value']==1
    assert db_session.get(BookCopy,copy.id).status=='borrowed'


def test_import_preview_apply_atomic_validation(client, db_session, report_data):
    ids=[copy.id for copy in report_data['copies']]
    content=f'copy_id,source,acquired_on,party,cost,currency,reference\n{ids[1]},purchased,2026-11-02,Synthetic supplier,12.50,PHP,Test\n{ids[2]},donated,2026-11-02,,,,Test'
    preview=client.post('/api/reporting/acquisitions/import-preview',files={'file':('test.csv',content,'text/csv')},headers=report_data['staff'])
    assert preview.status_code==200,preview.text
    payload=preview.json();assert db_session.query(CopyAcquisition).count()==0
    response=client.post('/api/reporting/acquisitions/import-apply',json={'rows':payload['rows'],'preview_token':payload['preview_token']},headers=report_data['staff'])
    assert response.status_code==200,response.text
    assert db_session.query(CopyAcquisition).count()==2
    assert client.post('/api/reporting/acquisitions/import-apply',json={'rows':payload['rows'],'preview_token':payload['preview_token']},headers=report_data['staff']).status_code==409
    duplicate=f'copy_id,source\n{ids[0]},donated\n{ids[0]},purchased'
    assert client.post('/api/reporting/acquisitions/import-preview',files={'file':('test.csv',duplicate,'text/csv')},headers=report_data['staff']).status_code==422


def test_philippine_boundaries_leap_days_and_partial_comparisons(client, db_session, report_data):
    from schemas.reporting import ReportFilters
    from timezone_utils import as_ph
    now = datetime(2026, 11, 4, 12, tzinfo=PH_TZ)
    for period, start, end, expected in [
        ('today', '2026-11-04', '2026-11-04', ('2026-11-03T00:00:00+08:00', '2026-11-03T12:00:00+08:00')),
        ('month', '2026-11-01', '2026-11-30', ('2026-10-01T00:00:00+08:00', '2026-10-04T12:00:00+08:00')),
        ('last-month', '2024-02-01', '2024-02-29', ('2024-01-01T00:00:00+08:00', '2024-02-01T00:00:00+08:00')),
        ('last-year', '2025-01-01', '2025-12-31', ('2024-01-01T00:00:00+08:00', '2025-01-01T00:00:00+08:00')),
    ]:
        a, b, comparable = reporting.previous_window(ReportFilters(start=start, end=end, period=period), now)
        assert (a.isoformat(), b.isoformat()) == expected and comparable
    a, b, comparable = reporting.previous_window(ReportFilters(start='2026-03-01', end='2026-03-31', period='month'), datetime(2026,3,30,12,tzinfo=PH_TZ))
    assert not comparable  # prior February lacks the same elapsed portion
    assert as_ph(datetime(2024,2,29)).isoformat() == '2024-02-29T00:00:00+08:00'
    for moment in [datetime(2024,2,28,23,59,59), datetime(2024,2,29), datetime(2024,2,29,23,59,59), datetime(2024,3,1)]:
        db_session.add(EntryLog(user_id=None, granted=True, accessed_at=moment))
    db_session.commit()
    result = query(client, report_data, 'visits', start='2024-02-29', end='2024-02-29', period='custom', group='day')
    assert result['total'] == 2 and len(result['charts'][0]['points']) == 1
    assert result['summary']['identified_unique_visitors'] == 0
    assert result['summary']['average_visits_per_calendar_day'] == 2


def test_empty_results_retired_zero_copy_titles_and_invalid_dates(client, db_session, report_data):
    empty = query(client, report_data, query='No matching title')
    assert empty['total'] == 0 and empty['summary']['average_loan_days'] is None
    copy = report_data['copies'][2]; copy.status = 'retired'
    db_session.add(Book(title='No physical copies', author='Synthetic', category='History', copies_total=0, copies_available=0))
    db_session.add(Transaction(user_id=report_data['member_id'], book_id=report_data['book'].id, type='return', status='returned', borrow_date=datetime(2026,11,3,tzinfo=PH_TZ), return_date=datetime(2026,11,2,tzinfo=PH_TZ)))
    db_session.commit()
    collection = query(client, report_data, 'collection', date_scope='all')
    assert collection['summary']['titles'] == 3
    assert collection['summary']['current_holdings'] == 3 and collection['summary']['retired'] == 1
    assert collection['summary']['physical_copy_records'] == 4
    assert query(client, report_data, 'collection', date_scope='all', holdings='current')['total'] == 3
    assert query(client, report_data)['summary']['excluded_duration_rows'] == 1
    assert query(client, report_data, 'inventory')['summary']['discrepant_titles'] >= 1
    for extra in ({'sort': 'password_hash'}, {'source': 'invented'}, {'start':'2026-11-30'}, {'category':'nlp','template':'profile'}, {'category':'programs'}):
        assert client.post('/api/reporting/query',json={'filters':filters(**extra)},headers=report_data['staff']).status_code == 422


@pytest.mark.parametrize('restriction', ['suspended', 'deleted', 'must_change_password'])
def test_reporting_endpoints_preserve_account_restrictions(client, db_session, report_data, restriction):
    staff = db_session.get(User, report_data['staff_id'])
    if restriction == 'suspended': staff.status = 'suspended'
    elif restriction == 'deleted': staff.deleted_at = now_ph()
    else: staff.must_change_password = True
    db_session.commit()
    calls = [
        ('get', '/api/reporting/metadata', None),
        ('get', '/api/reporting/acquisitions/1', None),
        ('post', '/api/reporting/dashboard', filters()),
        ('post', '/api/reporting/query', {'filters': filters()}),
        ('post', '/api/reporting/export', {'filters': filters(), 'format': 'csv'}),
        ('put', '/api/reporting/acquisitions/1', {'copy_id':1,'source':'donated'}),
        ('post', '/api/reporting/acquisitions/import-apply', {'rows':[{'copy_id':1}]}),
    ]
    for method, path, body in calls:
        assert client.request(method,path,json=body,headers=report_data['staff']).status_code in (401,403)


def test_large_export_stable_pagination_and_expiry(client, db_session, report_data, monkeypatch):
    import csv
    db_session.execute(EntryLog.__table__.insert(), [{'user_id':None,'granted':True,'accessed_at':datetime(2026,11,3,8),'entry_type':'manual'} for _ in range(5003)])
    db_session.commit()
    result = query(client, report_data, 'visits')
    assert result['total'] == 5006 and len(result['rows']) == 25
    second = client.post('/api/reporting/query',json={'filters':filters('visits'),'context':result['context'],'page':1},headers=report_data['staff']).json()
    assert not {r['id'] for r in result['rows']} & {r['id'] for r in second['rows']}
    body = {'filters': filters('visits'), 'context': result['context'], 'format':'csv'}
    exported = client.post('/api/reporting/export',json=body,headers=report_data['staff'])
    assert exported.status_code == 200
    with ZipFile(io.BytesIO(exported.content)) as bundle:
        rows = list(csv.reader(io.StringIO(bundle.read('records.csv').decode('utf-8-sig'))))
        assert len(rows) == 5007  # complete, beyond the former 5,000-row client ceiling
    monkeypatch.setattr(reporting,'MAX_EXPORT',100)
    assert client.post('/api/reporting/export',json=body,headers=report_data['staff']).status_code == 422
    assert client.post('/api/reporting/export',json={**body,'scope':'page'},headers=report_data['staff']).status_code == 200
    monkeypatch.setattr(reporting,'now_ph',lambda:datetime(2026,11,4,13,tzinfo=PH_TZ))
    assert client.post('/api/reporting/query',json={'filters':filters('visits'),'context':result['context']},headers=report_data['staff']).status_code == 409


def test_unknown_acquisition_dates_currency_types_and_import_failures(client, db_session, report_data):
    ids = [c.id for c in report_data['copies']]
    for copy_id, fields in [(ids[0], {'source':'donated'}), (ids[1], {'acquired_on':'2026-11-01'}), (ids[2], {'source':'purchased','acquired_on':'2026-11-02','cost':'12.50','currency':'PHP'})]:
        response = client.put(f'/api/reporting/acquisitions/{copy_id}', json={'copy_id':copy_id, **fields}, headers=report_data['staff'])
        assert response.status_code == 200, response.text
    assert query(client,report_data,'acquisitions')['total'] == 2
    assert query(client,report_data,'acquisitions',source='unknown')['total'] == 1
    assert query(client,report_data,'acquisitions',date_scope='unknown')['total'] == 2
    result = query(client,report_data,'acquisitions',source='purchased')
    response = client.post('/api/reporting/export',json={'filters':filters('acquisitions',source='purchased'),'context':result['context'],'format':'xlsx'},headers=report_data['staff'])
    ws = load_workbook(io.BytesIO(response.content))['Records']; headings=[c.value for c in ws[1]]
    assert ws.cell(2,headings.index('Cost')+1).data_type == 'n'
    assert ws.cell(2,headings.index('Acquired')+1).data_type == 'd'
    for content in ['copy_id,source\n999999,donated', f'copy_id,cost\n{ids[0]},-1', f'copy_id,source\n{ids[0]},invented']:
        response=client.post('/api/reporting/acquisitions/import-preview',files={'file':('bad.csv',content,'text/csv')},headers=report_data['staff'])
        assert response.status_code == 422
    assert db_session.query(CopyAcquisition).count() == 3
    assert client.post('/api/reporting/acquisitions/import-preview',files={'file':('bad.xlsx',b'not-a-workbook','application/octet-stream')},headers=report_data['staff']).status_code == 422


def test_removed_nlp_category_and_scoped_migration(db_session, client, report_data):
    from services.reporting_migration import upgrade_reporting_schema
    with db_session.bind.begin() as conn:
        upgrade_reporting_schema(conn); upgrade_reporting_schema(conn)
    metadata = client.get('/api/reporting/metadata', headers=report_data['staff']).json()
    assert 'nlp' not in metadata['categories']
    assert client.post('/api/reporting/query', json={'filters':filters('nlp')}, headers=report_data['staff']).status_code == 422
    assert db_session.query(CopyAcquisition).count() == 0


def test_acquisition_metadata_follows_existing_copy_lifecycle(client, db_session, report_data):
    copy = report_data['copies'][-1]  # synthetic unread title, no loan/reservation history
    copy_id = copy.id
    assert client.put(f'/api/reporting/acquisitions/{copy.id}', json={'copy_id':copy.id,'source':'donated'}, headers=report_data['staff']).status_code == 200
    copy.status = 'retired'; db_session.commit()
    assert db_session.get(CopyAcquisition,copy.id) is not None
    response = client.delete(f'/api/inventory/books/{copy.book_id}',headers=report_data['staff'])
    assert response.status_code == 204, response.text
    db_session.expire_all()
    assert db_session.query(CopyAcquisition).filter_by(copy_id=copy_id).count() == 0
    assert client.delete(f'/api/inventory/books/{report_data["book"].id}',headers=report_data['staff']).status_code == 409


def test_yesterday_visitors_filter_details_charts_and_export_together(client, db_session, report_data):
    import csv
    for moment, granted in [(datetime(2026,11,2,23,59,59),True),
                            (datetime(2026,11,3),True),
                            (datetime(2026,11,3,23,59,59),True),
                            (datetime(2026,11,3,12),False),
                            (datetime(2026,11,4),True)]:
        db_session.add(EntryLog(user_id=None,granted=granted,accessed_at=moment))
    db_session.commit()
    f = filters('visits',start='2026-11-03',end='2026-11-03',period='yesterday',group='day')
    response = client.post('/api/reporting/query',json={'filters':f},headers=report_data['staff'])
    assert response.status_code == 200
    result = response.json()
    assert result['total'] == result['summary']['matching_records'] == 2
    assert all(row['visited'].startswith('2026-11-03T') for row in result['rows'])
    assert result['charts'][0]['points'] == [{'label':'2026-11-03','value':2.0}]
    response = client.post('/api/reporting/export',json={'filters':f,'context':result['context'],'format':'csv'},headers=report_data['staff'])
    assert response.status_code == 200
    with ZipFile(io.BytesIO(response.content)) as archive:
        rows = list(csv.DictReader(io.StringIO(archive.read('records.csv').decode('utf-8-sig'))))
        assert len(rows) == 2 and all(row['Visited'].startswith('2026-11-03T') for row in rows)
    assert 'unavailable' not in client.get('/api/reporting/metadata',headers=report_data['staff']).json()


def test_inventory_acquisitions_create_retry_edit_and_reporting(client, db_session, report_data):
    from uuid import uuid4
    headers = {**report_data['staff'], 'Idempotency-Key': str(uuid4())}
    body = {'title': 'Acquisition integration', 'author': 'Synthetic', 'category': 'History', 'copies_total': 2,
            'acquisition': {'source': 'donated', 'acquired_on': '2026-11-01', 'party': 'Synthetic donor'}}
    created = client.post('/api/inventory/books', json=body, headers=headers)
    assert created.status_code == 201, created.text
    book_id = created.json()['id']
    assert client.post('/api/inventory/books', json=body, headers=headers).json()['id'] == book_id
    assert db_session.query(CopyAcquisition).count() == 2
    changed = {**body, 'acquisition': {'source': 'purchased'}}
    assert client.post('/api/inventory/books', json=changed, headers=headers).status_code == 409
    listed = client.get('/api/inventory/books', params={'search': 'Acquisition integration', 'source': 'donated'}, headers=report_data['staff']).json()
    assert listed['total'] == 1 and listed['items'][0]['acquisition_sources'] == {'donated': 2}
    copies = client.get(f'/api/inventory/books/{book_id}/acquisitions', headers=report_data['staff']).json()
    assert copies['total'] == 2
    copy_id = copies['items'][0]['id']
    acquisition = client.get(f'/api/reporting/acquisitions/{copy_id}', headers=report_data['staff']).json()
    updated = {key: value for key, value in acquisition.items() if key not in ('title', 'copy_qr')}
    updated.update(source='purchased', cost='150.50', currency='PHP')
    assert client.put(f'/api/reporting/acquisitions/{copy_id}', json=updated, headers=report_data['staff']).status_code == 200
    listing = client.get('/api/inventory/books', params={'search': 'Acquisition integration'}, headers=report_data['staff']).json()
    assert listing['items'][0]['acquisition_sources'] == {'donated': 1, 'purchased': 1}
    report = query(client, report_data, 'acquisitions', query='Acquisition integration', source='purchased')
    assert report['total'] == 1 and report['rows'][0]['id'] == copy_id
    # Public catalog does not expose donor, costs or acquisition metadata.
    public = client.get(f'/api/books/{book_id}').json()
    assert not {'acquisition', 'acquisition_sources', 'party', 'cost'} & public.keys()


def test_new_copy_source_preserves_existing_and_retired_history(client, db_session, report_data):
    body = {'title': 'Mixed source copies', 'author': 'Synthetic', 'category': 'History', 'copies_total': 2,
            'acquisition': {'source': 'donated'}}
    response = client.post('/api/inventory/books', json=body, headers=report_data['staff'])
    book_id = response.json()['id']
    assert client.put(f'/api/inventory/books/{book_id}', json={'copies_total': 1}, headers=report_data['staff']).status_code == 200
    response = client.put(f'/api/inventory/books/{book_id}', json={'copies_total': 3, 'new_copy_acquisition': {'source': 'purchased'}}, headers=report_data['staff'])
    assert response.status_code == 200, response.text
    copies = client.get(f'/api/inventory/books/{book_id}/acquisitions', headers=report_data['staff']).json()['items']
    assert [copy['source'] for copy in copies] == ['donated', 'donated', 'purchased', 'purchased']
    assert copies[1]['status'] == 'retired'
    assert client.put(f'/api/inventory/books/{book_id}', json={'new_copy_acquisition': {'source': 'other'}}, headers=report_data['staff']).status_code == 422
    # Backfilled legacy copies must not inherit metadata for newly added copies.
    legacy = Book(title='Legacy copy gap', author='Synthetic', category='History', copies_total=2, copies_available=2)
    db_session.add(legacy); db_session.commit()
    response = client.put(f'/api/inventory/books/{legacy.id}', json={'copies_total': 3, 'new_copy_acquisition': {'source': 'donated'}}, headers=report_data['staff'])
    assert response.status_code == 200, response.text
    copies = client.get(f'/api/inventory/books/{legacy.id}/acquisitions', headers=report_data['staff']).json()['items']
    assert [copy['source'] for copy in copies] == [None, None, 'donated']


def test_inventory_acquisition_validation_access_and_import(client, db_session, report_data):
    from openpyxl import Workbook
    for path in ['/api/inventory/books', f"/api/inventory/books/{report_data['book'].id}/acquisitions"]:
        assert client.get(path).status_code == 401
        assert client.get(path, headers=report_data['member']).status_code == 403
    body = {'title': 'Invalid acquisition', 'author': 'Synthetic', 'category': 'History', 'acquisition': {'source': 'purchased', 'cost': '-2', 'currency': 'PHP'}}
    assert client.post('/api/inventory/books', json=body, headers=report_data['staff']).status_code == 422
    assert not db_session.query(Book).filter_by(title='Invalid acquisition').first()
    workbook = Workbook(); sheet = workbook.active
    sheet.append(['Title', 'Author', 'Copies', 'Acquisition source', 'Acquisition date', 'Cost per copy', 'Currency'])
    sheet.append(['Imported donated', 'Synthetic', 2, 'donated', datetime(2026,11,1), None, None])
    sheet.append(['Imported bought', 'Synthetic', 1, 'bought', '2026-11-02', 125.5, 'php'])
    sheet.append(['Imported unknown', 'Synthetic', 1, None, None, None, None])
    sheet.append(['Invalid negative cost', 'Synthetic', 1, 'purchased', '2026-11-02', -20, 'PHP'])
    buffer = io.BytesIO(); workbook.save(buffer)
    response = client.post('/api/inventory/bulk-upload', files={'file': ('acquisitions.xlsx', buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}, headers=report_data['staff'])
    assert response.status_code == 200, response.text
    assert response.json()['added'] == 3 and len(response.json()['errors']) == 1
    assert db_session.query(CopyAcquisition).count() == 3
    assert not db_session.query(Book).filter_by(title='Invalid negative cost').first()
    result = client.get('/api/inventory/books?source=unknown&search=Imported', headers=report_data['staff']).json()
    assert result['total'] == 1 and result['items'][0]['title'] == 'Imported unknown'
