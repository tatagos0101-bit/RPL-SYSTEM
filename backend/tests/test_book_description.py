import io
from uuid import uuid4

import pytest
from openpyxl import Workbook
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateColumn

from database import Base
from models.book import Book
from models.book_copy import BookCopy
from models.inventory_write import InventoryWrite
from models.user import User
from routers.auth import _make_token
from schemas.book import BookCreate
from services.excel_service import parse_excel
from services.inventory_writes import fingerprint
from services.schema_migrations import upgrade_schema


@pytest.fixture()
def staff(db_session):
    user = User(name='Synthetic description librarian', role='librarian', password_hash='unused-test-hash')
    db_session.add(user)
    db_session.commit()
    return user, {'Authorization': 'Bearer ' + _make_token(user.id)}


def payload(**extra):
    return {'title': 'Synthetic description book', 'author': 'Sample Author', 'category': 'History', **extra}


def test_description_round_trips_and_preserves_copy_identity(client, db_session, staff):
    _, headers = staff
    response = client.post('/api/inventory/books', headers=headers,
                           json=payload(description='  A short catalog description.  ', copies_total=2))
    assert response.status_code == 201
    created = response.json()
    assert created['description'] == 'A short catalog description.'
    copies = [(c.id, c.qr_code) for c in db_session.query(BookCopy).filter_by(book_id=created['id']).order_by(BookCopy.id)]
    assert client.get(f"/api/books/{created['id']}").json()['description'] == created['description']
    updated = client.put(f"/api/inventory/books/{created['id']}", headers=headers, json={'title': 'Renamed sample book'})
    assert updated.status_code == 200
    assert updated.json()['description'] == created['description']
    cleared = client.put(f"/api/inventory/books/{created['id']}", headers=headers, json={'description': '   '})
    assert cleared.status_code == 200 and cleared.json()['description'] is None
    db_session.expire_all()
    assert [(c.id, c.qr_code) for c in db_session.query(BookCopy).filter_by(book_id=created['id']).order_by(BookCopy.id)] == copies


def test_optional_description_and_public_plain_text(client, staff):
    _, headers = staff
    response = client.post('/api/inventory/books', headers=headers, json=payload())
    assert response.status_code == 201
    assert response.json()['description'] is None
    raw = '<script>alert("synthetic")</script> is catalog text, never HTML.'
    response = client.put(f"/api/inventory/books/{response.json()['id']}", headers=headers, json={'description': raw})
    assert response.status_code == 200 and response.json()['description'] == raw
    assert client.get(f"/api/books/{response.json()['id']}").json()['description'] == raw


@pytest.mark.parametrize('value', ['x' * 2001, 123, ['not text'], 'bad\x00text'], ids=['too-long', 'number', 'list', 'null-character'])
def test_description_rejects_invalid_values(client, staff, value):
    _, headers = staff
    assert client.post('/api/inventory/books', headers=headers, json=payload(description=value)).status_code == 422


def test_description_length_boundary(client, staff):
    _, headers = staff
    response = client.post('/api/inventory/books', headers=headers, json=payload(description='x' * 2000))
    assert response.status_code == 201 and len(response.json()['description']) == 2000
    assert client.put(f"/api/inventory/books/{response.json()['id']}", headers=headers, json={'description': 'x' * 2001}).status_code == 422


@pytest.mark.parametrize('role,status,expected', [('member', 'active', 403), ('librarian', 'suspended', 401)])
def test_description_writes_keep_role_and_status_checks(client, db_session, role, status, expected):
    actor = User(name='Synthetic denied actor', role=role, status='active', password_hash='unused-test-hash')
    db_session.add(actor)
    db_session.commit()
    headers = {'Authorization': 'Bearer ' + _make_token(actor.id)}
    actor.status = status
    db_session.commit()
    response = client.post('/api/inventory/books', headers=headers, json=payload(description='Denied'))
    assert response.status_code == expected


def test_description_anonymous_write_is_rejected(client):
    assert client.post('/api/inventory/books', json=payload(description='Denied')).status_code == 401


def test_preupgrade_create_receipt_replays_without_description_hash_change(client, db_session, staff):
    actor, headers = staff
    key = str(uuid4())
    headers = {**headers, 'Idempotency-Key': key}
    body = payload()
    response = client.post('/api/inventory/books', headers=headers, json=body)
    assert response.status_code == 201
    saved = db_session.get(InventoryWrite, (actor.id, key))
    # Receipt created before description existed: all prior defaults remain hashed.
    legacy_body = BookCreate(**body).model_dump(mode='json', exclude={'acquisition', 'description', 'is_borrowable', 'circulation_note'})
    saved.fingerprint = fingerprint(legacy_body)
    db_session.commit()
    retry = client.post('/api/inventory/books', headers=headers, json=body)
    assert retry.status_code == 201 and retry.json()['id'] == response.json()['id']
    assert db_session.query(Book).count() == 1
    changed = client.post('/api/inventory/books', headers=headers, json={**body, 'description': 'New content'})
    assert changed.status_code == 409


def test_description_upgrade_is_additive_repeatable_and_preserves_rows():
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        if 'description' in {c['name'] for c in inspect(conn).get_columns('books')}:
            conn.execute(text('ALTER TABLE books DROP COLUMN description'))
        conn.execute(text("INSERT INTO books (id,title,author,category,copies_total,copies_available,qr_code) VALUES (901,'Synthetic old book','Sample','History',2,1,'RPL-00901')"))
        upgrade_schema(conn, Base.metadata)
        assert 'description' in {c['name'] for c in inspect(conn).get_columns('books')}
        assert conn.execute(text('SELECT description,copies_total,copies_available,qr_code FROM books WHERE id=901')).one() == (None, 2, 1, 'RPL-00901')
        conn.execute(text("UPDATE books SET description='Preserved note' WHERE id=901"))
        upgrade_schema(conn, Base.metadata)
        assert conn.execute(text('SELECT description FROM books WHERE id=901')).scalar() == 'Preserved note'
    assert 'description TEXT' in str(CreateColumn(Book.__table__.c.description).compile(dialect=postgresql.dialect()))
    engine.dispose()


def test_workbook_optional_description_is_parsed_without_breaking_old_headers():
    wb = Workbook()
    wb.active.append(['Title', 'Author', 'Description'])
    wb.active.append(['Sample workbook book', 'Sample Author', 'A workbook catalog note.'])
    data = io.BytesIO()
    wb.save(data)
    assert parse_excel(data.getvalue())[0]['description'] == 'A workbook catalog note.'
    wb.active.delete_cols(3)
    data = io.BytesIO()
    wb.save(data)
    assert parse_excel(data.getvalue())[0].get('description') is None
