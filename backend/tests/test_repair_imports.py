from io import BytesIO
from openpyxl import Workbook
from models.book import Book
from models.user import User
from routers.auth import _make_token


def test_partial_import_preserves_valid_rows_and_original_numbers(client, db_session, monkeypatch):
    from routers import inventory
    original = inventory.ensure_book_copies
    def fail_one(db, book_id, **kwargs):
        if db.get(Book, book_id).title == 'Database failure':
            raise ValueError('synthetic failure after flush')
        return original(db, book_id, **kwargs)
    monkeypatch.setattr(inventory, 'ensure_book_copies', fail_one)
    staff = User(name='Synthetic staff', role='librarian', password_hash='unused')
    db_session.add(staff); db_session.commit()
    token = _make_token(staff.id, db_session); db_session.commit()
    workbook = Workbook(); sheet = workbook.active
    sheet.append(['Title', 'Author', 'Copies'])
    sheet.append(['First', 'Author', 1])
    sheet.append([None, None, None])
    sheet.append(['Database failure', 'Author', 1])
    sheet.append(['Last', 'Author', 2])
    sheet.append(['T' * 256, 'Author', 1])
    content = BytesIO(); workbook.save(content)
    response = client.post('/api/inventory/bulk-upload', headers={'Authorization': 'Bearer ' + token},
                           files={'file': ('books.xlsx', content.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert response.status_code == 200, response.text
    assert response.json()['added'] == 2
    assert [row.title for row in db_session.query(Book).order_by(Book.id)] == ['First', 'Last']
    assert response.json()['errors'][0].startswith('Row 4:')
    assert response.json()['errors'][1].startswith('Row 6:')


def test_legacy_xls_import_is_explicitly_rejected(client, db_session):
    staff = User(name='Synthetic staff', role='librarian', password_hash='unused')
    db_session.add(staff); db_session.commit()
    token = _make_token(staff.id, db_session); db_session.commit()
    response = client.post('/api/inventory/bulk-upload', headers={'Authorization': 'Bearer ' + token},
                           files={'file': ('books.xls', b'legacy', 'application/vnd.ms-excel')})
    assert response.status_code == 400
    assert '.xlsx' in response.json()['detail']


def test_cover_cleanup_preserves_shared_reference_and_only_runs_after_commit(client, db_session, monkeypatch):
    from routers import inventory
    staff = User(name='Synthetic staff', role='librarian', password_hash='unused')
    books = [Book(title=f'Synthetic {i}', author='Author', category='General', copies_total=1,
                  copies_available=1, cover_url='/uploads/covers/shared.png') for i in range(2)]
    db_session.add_all([staff, *books]); db_session.commit()
    token = _make_token(staff.id, db_session); db_session.commit()
    headers = {'Authorization': 'Bearer ' + token}
    deleted = []
    def track_delete(reference, **kwargs):
        db_session.expire_all()
        assert not db_session.query(Book).filter_by(cover_url=reference).first()
        deleted.append(reference)
    monkeypatch.setattr(inventory, 'delete_upload', track_delete)
    assert client.put(f'/api/inventory/books/{books[0].id}', headers=headers, json={'cover_url': None}).status_code == 200
    assert deleted == []
    assert client.put(f'/api/inventory/books/{books[1].id}', headers=headers, json={'cover_url': None}).status_code == 200
    assert deleted == ['/uploads/covers/shared.png']


def test_single_book_and_copy_failure_roll_back_together(client, db_session, monkeypatch):
    from routers import inventory
    staff = User(name='Synthetic staff', role='librarian', password_hash='unused')
    db_session.add(staff); db_session.commit()
    token = _make_token(staff.id, db_session); db_session.commit()
    def fail_copies(*args, **kwargs):
        from fastapi import HTTPException
        raise HTTPException(409, 'Synthetic copy failure')
    monkeypatch.setattr(inventory, 'ensure_book_copies', fail_copies)
    result = client.post('/api/inventory/books', headers={'Authorization': 'Bearer ' + token},
                         json={'title': 'Must not save', 'author': 'Author', 'category': 'General'})
    assert result.status_code == 409
    assert db_session.query(Book).count() == 0
