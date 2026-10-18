from datetime import timedelta
from hashlib import sha256
from io import BytesIO
from uuid import uuid4

from openpyxl import Workbook
from sqlalchemy import event

from models.book import Book
from models.book_copy import BookCopy
from models.face_embedding import FaceEmbedding
from models.inventory_write import InventoryWrite
from models.reservation import Reservation
from models.transaction import Transaction
from models.user import User
from routers.auth import _make_token
from timezone_utils import now_ph


def login(db, role='librarian', status='active'):
    user = User(name='Synthetic staff', role=role, status=status, password_hash='unused')
    db.add(user); db.commit()
    token = _make_token(user.id, db); db.commit()
    return user, {'Authorization': 'Bearer ' + token}


def test_non_isbn_create_replays_and_reconciles_only_for_owner(client, db_session):
    staff, headers = login(db_session)
    key = str(uuid4())
    payload = {'title': 'Synthetic non-ISBN', 'author': 'Author', 'category': 'General', 'copies_total': 2}
    request_headers = {**headers, 'Idempotency-Key': key}
    first = client.post('/api/inventory/books', headers=request_headers, json=payload)
    assert first.status_code == 201, first.text
    repeated = client.post('/api/inventory/books', headers=request_headers, json=payload)
    assert repeated.json() == first.json()
    status = client.get(f'/api/inventory/write-requests/{key}', headers=headers)
    assert status.json()['result'] == first.json()
    assert db_session.query(Book).count() == 1
    assert db_session.query(BookCopy).count() == 2
    assert db_session.query(InventoryWrite).count() == 1
    conflict = client.post('/api/inventory/books', headers=request_headers, json={**payload, 'title': 'Changed'})
    assert conflict.status_code == 409
    _, other_headers = login(db_session)
    assert client.get(f'/api/inventory/write-requests/{key}', headers=other_headers).status_code == 404
    assert client.get(f'/api/inventory/write-requests/{key}').status_code == 401
    _, member_headers = login(db_session, 'member')
    assert client.get(f'/api/inventory/write-requests/{key}', headers=member_headers).status_code == 403
    staff.status = 'suspended'; db_session.commit()
    assert client.post('/api/inventory/books', headers=request_headers, json=payload).status_code == 401


def test_failed_create_has_no_receipt_or_inventory(client, db_session, monkeypatch):
    from routers import inventory
    from fastapi import HTTPException
    _, headers = login(db_session)
    def fail(*args, **kwargs):
        raise HTTPException(409, 'Synthetic failure before commit')
    monkeypatch.setattr(inventory, 'ensure_book_copies', fail)
    response = client.post('/api/inventory/books', headers={**headers, 'Idempotency-Key': str(uuid4())},
                           json={'title': 'Synthetic', 'author': 'Author', 'category': 'General'})
    assert response.status_code == 409
    assert db_session.query(Book).count() == db_session.query(InventoryWrite).count() == 0


def test_workbook_partial_result_replays_without_reopening_consumed_upload(client, db_session, monkeypatch):
    from routers import inventory
    _, headers = login(db_session)
    workbook = Workbook(); sheet = workbook.active
    sheet.append(['Title', 'Author', 'Copies'])
    sheet.append(['Non-ISBN first', 'Author', 1])
    sheet.append(['T' * 256, 'Author', 1])
    sheet.append(['Non-ISBN last', 'Author', 2])
    content = BytesIO(); workbook.save(content); raw = content.getvalue()
    key = str(uuid4())
    headers = {**headers, 'Idempotency-Key': key, 'X-Content-SHA256': sha256(raw).hexdigest()}
    first = client.post('/api/inventory/bulk-upload', headers=headers,
                        files={'file': ('synthetic.xlsx', raw, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert first.status_code == 200, first.text
    assert first.json()['added'] == 2 and len(first.json()['errors']) == 1
    async def must_not_read(**kwargs):
        raise AssertionError('A committed import must replay before reopening a consumed upload')
    monkeypatch.setattr(inventory, 'read_upload', must_not_read)
    repeat = client.post('/api/inventory/bulk-upload', headers=headers, data={'upload_ticket': 'already-consumed'})
    assert repeat.json() == first.json()
    assert db_session.query(Book).count() == 2
    assert db_session.query(BookCopy).count() == 3
    changed = client.post('/api/inventory/bulk-upload', headers={**headers, 'X-Content-SHA256': '0' * 64})
    assert changed.status_code == 409


def test_workbook_digest_checked_before_any_rows_commit(client, db_session):
    _, headers = login(db_session)
    result = client.post('/api/inventory/bulk-upload',
                         headers={**headers, 'Idempotency-Key': str(uuid4()), 'X-Content-SHA256': '0' * 64},
                         files={'file': ('synthetic.xlsx', b'changed workbook', 'application/octet-stream')})
    assert result.status_code == 409
    assert db_session.query(Book).count() == db_session.query(InventoryWrite).count() == 0


def test_qr_pagination_and_complete_export_beyond_ten_thousand(client, db_session, monkeypatch):
    from routers import inventory
    from services.book_copy_service import ensure_book_copies
    _, headers = login(db_session)
    book = Book(title='Synthetic large inventory', author='Author', category='General', copies_total=10001, copies_available=10001)
    db_session.add(book); db_session.flush(); ensure_book_copies(db_session, book.id)
    assert client.get('/api/inventory/book-copies/count', headers=headers).json() == {'total': 10001}
    final_page = client.get('/api/inventory/book-copies?skip=10000&limit=20', headers=headers).json()
    assert len(final_page) == 1 and final_page[0]['copy_number'] == 10001
    qr = final_page[0]['qr_code']
    assert client.get('/api/inventory/book-copies/count', headers=headers, params={'search': qr}).json()['total'] == 1
    assert client.post('/api/inventory/book-copies/qr-pdf', headers=headers, json=[]).status_code == 400
    assert client.post('/api/inventory/book-copies/qr-pdf', headers=headers, json=[999999]).status_code == 409
    batches = []
    def render(copies):
        batches.append([copy.id for copy in copies])
        assert len(copies) <= 200
        return b'%PDF synthetic labels'
    monkeypatch.setattr(inventory, 'generate_bulk_pdf', render)
    response = client.get('/api/inventory/book-copies/export', headers=headers)
    assert response.status_code == 200
    snapshot = response.json()
    assert snapshot['total'] == len(snapshot['copy_ids']) == 10001
    for offset in range(0, snapshot['total'], 200):
        result = client.post('/api/inventory/book-copies/qr-pdf', headers=headers,
                             json=snapshot['copy_ids'][offset:offset + 200])
        assert result.status_code == 200
    assert len({item for batch in batches for item in batch}) == 10001
    assert client.get('/api/inventory/book-copies/export').status_code == 401
    _, member_headers = login(db_session, 'member')
    assert client.get('/api/inventory/book-copies/export', headers=member_headers).status_code == 403


def test_member_page_batches_counts_and_face_flags(client, db_session):
    _, headers = login(db_session)
    members = [User(name=f'Synthetic member {i}', role='member', password_hash='unused') for i in range(25)]
    book = Book(title='Synthetic', author='Author', category='General')
    db_session.add_all([*members, book]); db_session.commit()
    target = members[-1]
    db_session.add_all([
        Transaction(user_id=target.id, book_id=book.id, type='return', status='returned', borrow_date=now_ph()),
        Transaction(user_id=target.id, book_id=book.id, type='borrow', status='active', borrow_date=now_ph()),
        *[FaceEmbedding(user_id=target.id, engine='synthetic', dimension=2, embedding='[0,0]') for _ in range(2)],
        FaceEmbedding(user_id=members[0].id, engine='synthetic', dimension=2, embedding='[0,0]', is_active=False),
    ]); db_session.commit()
    statements = []
    def count(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith('SELECT'):
            statements.append(statement)
    engine = db_session.get_bind()
    event.listen(engine, 'before_cursor_execute', count)
    try:
        one = client.get('/api/librarian/users?limit=1', headers=headers)
        one_count = len(statements); statements.clear()
        many = client.get('/api/librarian/users?limit=25', headers=headers)
        assert one.status_code == many.status_code == 200
        assert len(statements) == one_count
        row = next(row for row in many.json() if row['id'] == target.id)
        assert row['active_loans'] == 1 and row['total_loans'] == 2 and row['face_enrolled']
        assert not next(row for row in many.json() if row['id'] == members[0].id)['face_enrolled']
    finally:
        event.remove(engine, 'before_cursor_execute', count)
    stats = client.get('/api/librarian/users/stats', headers=headers).json()
    assert stats['enrolled'] == 1 and stats['total'] == 25


def test_reservation_pages_counts_and_search_have_same_scope(client, db_session):
    _, headers = login(db_session)
    book = Book(title='Synthetic queue', author='Author', category='General', copies_total=0, copies_available=0)
    members = [User(name=f'Synthetic {i:03}', role='member', password_hash='unused') for i in range(205)]
    db_session.add_all([book, *members]); db_session.commit()
    db_session.add_all([Reservation(user_id=member.id, book_id=book.id, status='pending',
                                   reserved_at=now_ph(), queue_position=i + 1) for i, member in enumerate(members)])
    db_session.commit()
    counts = client.get('/api/librarian/reservations/count', headers=headers).json()
    assert counts == {'total': 205, 'ready': 0, 'pending': 205}
    page = client.get('/api/librarian/reservations?skip=200&limit=20', headers=headers)
    assert page.status_code == 200 and len(page.json()) == 5
    params = {'search': 'Synthetic 204', 'status': 'pending'}
    assert client.get('/api/librarian/reservations/count', headers=headers, params=params).json()['total'] == 1
    assert len(client.get('/api/librarian/reservations', headers=headers, params=params).json()) == 1
    assert client.get('/api/librarian/reservations?status=invalid', headers=headers).status_code == 400
    assert client.get('/api/librarian/reservations/count').status_code == 401
    _, member_headers = login(db_session, 'member')
    assert client.get('/api/librarian/reservations/count', headers=member_headers).status_code == 403


def test_public_policy_reflects_nondefault_configuration(client, monkeypatch):
    from routers import books
    monkeypatch.setattr(books, 'LOAN_DAYS', 21)
    monkeypatch.setattr(books, 'FINE_PER_DAY', 7.5)
    now = now_ph(); monkeypatch.setattr(books, 'now_ph', lambda: now)
    response = client.get('/api/books/policy')
    assert response.status_code == 200
    assert response.json()['loan_days'] == 21 and response.json()['fine_per_day'] == 7.5
    assert response.json()['preview_due_date'] == (now + timedelta(days=21)).isoformat()
