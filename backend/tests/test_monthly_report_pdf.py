from datetime import datetime, timedelta
from io import BytesIO

from pypdf import PdfReader

from models.book import Book
from models.entry_log import EntryLog
from models.transaction import Transaction
from models.user import User
from routers.auth import _hash
from services.report_service import build_monthly_report
from timezone_utils import PH_TZ


def pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def create_librarian(db):
    user = User(
        name="Report Librarian",
        email="report-librarian@example.test",
        password_hash=_hash("Password1"),
        role="librarian",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_member(db):
    user = User(
        name="Report Member",
        email="report-member@example.test",
        password_hash=_hash("Password1"),
        role="member",
        member_id="RPL-REPORT",
        status="active",
        created_at=datetime(2026, 7, 3, 9, 0, tzinfo=PH_TZ),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login(client, email, password="Password1"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_monthly_report_service_uses_monochrome_categorized_sections():
    report = {'month':'July 2026', 'start':'2026-07-01', 'end':'2026-07-31', 'as_of':'2026-08-01T00:00:00+08:00',
        'sections':[{'title': title, 'scope':'Selected month', 'notes':[], 'datasets':[
            {'title':'Monthly activity', 'total':2, 'summary':{'matching_records':2}, 'breakdowns':[],
             'columns':[{'key':'id','label':'ID'},{'key':'title','label':'Title'}],
             'rows':[{'id':1,'title':'Synthetic <record> & safe text'}, {'id':2,'title':'Last record'}]}]}
            for title in ['Library usage','Circulation','Patrons','Collection','Acquisitions','Inventory']]}
    pdf = build_monthly_report(report)
    text = pdf_text(pdf)
    for title in ['Monthly Library Report','Library usage','Circulation','Patrons','Collection','Acquisitions','Inventory','Last record','Synthetic <record> & safe text']:
        assert title in text
    reader = PdfReader(BytesIO(pdf))
    for page in reader.pages:
        for operands, operator in page.get_contents().operations:
            if operator in (b'rg', b'RG'):
                assert float(operands[0]) == float(operands[1]) == float(operands[2])
            assert operator not in (b'k',b'K')  # No CMYK color coding.


def test_monthly_report_endpoint_includes_visitor_and_collection_counts(client, db_session):
    librarian = create_librarian(db_session)
    member = create_member(db_session)
    book_one = Book(
        title="Noli Me Tangere",
        author="Jose Rizal",
        category="Novel",
        copies_total=3,
        copies_available=2,
        qr_code="RPT-BOOK-1",
    )
    book_two = Book(
        title="El Filibusterismo",
        author="Jose Rizal",
        category="Novel",
        copies_total=1,
        copies_available=1,
        qr_code="RPT-BOOK-2",
    )
    db_session.add_all([book_one, book_two])
    db_session.commit()
    db_session.refresh(book_one)

    borrow_date = datetime(2026, 7, 5, 10, 0, tzinfo=PH_TZ)
    db_session.add(Transaction(
        user_id=member.id,
        book_id=book_one.id,
        type="borrow",
        status="active",
        borrow_date=borrow_date,
        due_date=borrow_date + timedelta(days=7),
    ))
    db_session.add_all([
        EntryLog(user_id=member.id, granted=True, accessed_at=datetime(2026, 7, 5, 8, 0, tzinfo=PH_TZ)),
        EntryLog(user_id=member.id, granted=True, accessed_at=datetime(2026, 7, 6, 8, 0, tzinfo=PH_TZ)),
        EntryLog(user_id=None, granted=False, note="Unknown visitor", accessed_at=datetime(2026, 7, 7, 8, 0, tzinfo=PH_TZ)),
    ])
    db_session.commit()
    token = login(client, librarian.email)

    response = client.get(
        "/api/reports/monthly?month=7&year=2026",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    text = pdf_text(response.content)
    assert "Library usage" in text
    assert "Denied entry attempts" in text
    assert "Collection" in text
    assert "Declared Copies" in text

    db_session.expire_all()
    assert db_session.query(Transaction).one().status == 'active'  # PDF reads never synchronize status.


def test_monthly_pdf_complete_records_boundaries_and_limits(client, db_session, monkeypatch):
    from services.monthly_report import monthly_data
    from services import monthly_report as service
    staff = create_librarian(db_session)
    member = create_member(db_session)
    logs = [EntryLog(user_id=member.id, granted=True, entry_type='manual', accessed_at=datetime(2026,7,1,tzinfo=PH_TZ)+timedelta(minutes=index)) for index in range(105)]
    logs += [EntryLog(user_id=member.id, granted=True, entry_type='face_scan', accessed_at=datetime(2026,8,1,tzinfo=PH_TZ))]
    db_session.add_all(logs); db_session.commit()
    report = monthly_data(db_session,7,2026)
    visits = report['sections'][0]['datasets'][0]
    assert visits['total'] == len(visits['rows']) == 105
    assert visits['summary']['identified_unique_visitors'] == 1
    assert all(row['entry_method']=='manual' for row in visits['rows'])
    pdf = build_monthly_report(report)
    text = pdf_text(pdf)
    assert '2026-07-01 01:44:00 PHT' in ' '.join(text.split())  # Final row beyond the old 80-row preview.
    assert not any(row['visited'].startswith('2026-08-01') for row in visits['rows'])
    token = login(client,staff.email)
    headers = {'Authorization':f'Bearer {token}'}
    monkeypatch.setattr(service,'MAX_MONTHLY_ROWS',2)
    response=client.get('/api/reports/monthly?month=7&year=2026',headers=headers)
    assert response.status_code==422 and 'No partial PDF' in response.json()['detail']
    client.cookies.clear()
    assert client.get('/api/reports/monthly?month=7&year=2026').status_code==401
    token=login(client,member.email)
    assert client.get('/api/reports/monthly?month=7&year=2026',headers={'Authorization':f'Bearer {token}'}).status_code==403
