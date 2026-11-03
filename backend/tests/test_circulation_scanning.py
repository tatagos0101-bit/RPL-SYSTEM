from datetime import timedelta
from uuid import uuid4

from models.book import Book
from models.book_copy import BookCopy
from models.inventory_write import InventoryWrite
from models.reservation import Reservation
from models.transaction import Transaction
from models.user import User
from routers.auth import _make_token
from services.book_copy_service import ensure_book_copies
from timezone_utils import now_ph


def setup(db):
    users = [User(name=f'Synthetic {i}', password_hash='unused', role=role, status='active', member_id=f'SYN-{i}')
             for i, role in enumerate(('librarian', 'librarian', 'member', 'member'))]
    book = Book(title='Synthetic QR title', author='Synthetic', category='General',
                qr_code='RPL-00001', copies_total=2, copies_available=2)
    db.add_all([*users, book]); db.commit()
    ensure_book_copies(db, book.id)
    copies = db.query(BookCopy).order_by(BookCopy.id).all()
    headers = []
    for user in users:
        headers.append({'Authorization': 'Bearer ' + _make_token(user.id, db)})
    db.commit()
    return users, book, copies, headers


def post(client, operation, headers, payload, key=None):
    return client.post('/api/transactions/' + operation,
                       headers={**headers, 'Idempotency-Key': key or str(uuid4())}, json=payload)


def test_copy_lookup_is_read_only_and_protected(client, db_session):
    users, book, copies, headers = setup(db_session)
    path = '/api/transactions/scan'
    params = {'code': copies[0].qr_code, 'mode': 'borrow'}
    assert client.get(path, params=params).status_code == 401
    assert client.get(path, params=params, headers=headers[2]).status_code == 403
    assert client.get('/api/transactions/write-requests/' + str(uuid4()), headers=headers[2]).status_code == 403
    data = client.get(path, params=params, headers=headers[0]).json()
    assert data['qr_type'] == 'copy' and data['candidates'][0]['available']
    assert 'member_name' not in data['candidates'][0]
    legacy = client.get(path, params={'code': book.qr_code, 'mode': 'borrow'}, headers=headers[0]).json()
    assert legacy['qr_type'] == 'book' and len(legacy['candidates']) == 2
    assert db_session.query(Transaction).count() == db_session.query(InventoryWrite).count() == 0
    db_session.query(BookCopy).delete(); db_session.commit()
    assert client.get(path, params={'code': book.qr_code, 'mode': 'borrow'}, headers=headers[0]).status_code == 409
    assert db_session.query(BookCopy).count() == 0  # Scanning must not backfill copies.
    for code in ('9780140328721', 'https://example.test', 'bogus'):
        assert client.get(path, params={'code': code, 'mode': 'borrow'}, headers=headers[0]).status_code in (400, 404)
    users[0].status = 'suspended'; db_session.commit()
    assert client.get(path, params=params, headers=headers[0]).status_code == 401


def test_receipts_and_exact_loan_returns(client, db_session):
    users, book, copies, headers = setup(db_session)
    payload = dict(user_id=users[2].id, book_id=book.id, copy_id=copies[0].id)
    key = str(uuid4())
    borrowed = post(client, 'borrow', headers[0], payload, key)
    assert borrowed.status_code == 201, borrowed.text
    assert post(client, 'borrow', headers[0], payload, key).json() == borrowed.json()
    assert post(client, 'borrow', headers[0], dict(payload, copy_id=copies[1].id), key).status_code == 409
    receipt = '/api/transactions/write-requests/' + key
    assert client.get(receipt, headers=headers[0]).json()['result'] == borrowed.json()
    assert client.get(receipt, headers=headers[1]).status_code == 404
    assert client.get(receipt).status_code == 401
    assert db_session.query(Transaction).count() == 1
    scanned = client.get('/api/transactions/scan', params={'code': copies[0].qr_code, 'mode': 'return'}, headers=headers[0]).json()
    loan = scanned['candidates'][0]
    assert loan['transaction_id'] == borrowed.json()['id'] and loan['member_name'] == users[2].name
    assert 'email' not in loan and 'phone' not in loan and 'password_hash' not in loan
    returned_payload = dict(payload, transaction_id=loan['transaction_id'])
    assert post(client, 'return', headers[0], dict(returned_payload, copy_id=copies[1].id)).status_code == 404
    assert post(client, 'return', headers[0], dict(returned_payload, user_id=users[3].id)).status_code == 404
    assert post(client, 'return', headers[0], payload).status_code == 422
    return_key = str(uuid4())
    returned = post(client, 'return', headers[0], returned_payload, return_key)
    assert returned.status_code == 200, returned.text
    assert returned.json()['borrow_date'] == borrowed.json()['borrow_date']
    assert post(client, 'return', headers[0], returned_payload, return_key).json() == returned.json()
    newer = post(client, 'borrow', headers[0], payload)
    assert newer.status_code == 201
    assert post(client, 'return', headers[0], returned_payload).status_code == 404
    assert post(client, 'return', headers[0], returned_payload, return_key).json() == returned.json()
    db_session.expire_all()
    assert db_session.get(Transaction, newer.json()['id']).status == 'active'
    assert db_session.get(Book, book.id).copies_available == 1


def test_mixed_borrowers_legacy_choices_fines_and_changed_availability(client, db_session):
    users, book, copies, headers = setup(db_session)
    loans = []
    for index in range(2):
        response = post(client, 'borrow', headers[0], dict(user_id=users[index + 2].id, book_id=book.id, copy_id=copies[index].id))
        assert response.status_code == 201
        loans.append(response.json())
    result = client.get('/api/transactions/scan', params={'code': book.qr_code, 'mode': 'return'}, headers=headers[0]).json()
    assert len(result['candidates']) == 2
    assert {row['user_id'] for row in result['candidates']} == {users[2].id, users[3].id}
    assert post(client, 'borrow', headers[0], dict(user_id=users[3].id, book_id=book.id, copy_id=copies[0].id)).status_code == 409
    old = db_session.get(Transaction, loans[0]['id']); old.due_date = now_ph() - timedelta(days=3); db_session.commit()
    for loan in loans:
        result = post(client, 'return', headers[0], dict(user_id=loan['user_id'], book_id=book.id, copy_id=loan['copy_id'], transaction_id=loan['id']))
        assert result.status_code == 200
        if loan == loans[0]:
            assert float(result.json()['fine_amount']) > 0
    db_session.expire_all()
    assert db_session.get(Book, book.id).copies_available == 2


def test_receipt_and_loan_roll_back_together(client, db_session, monkeypatch):
    from fastapi import HTTPException
    from routers import transactions
    users, book, copies, headers = setup(db_session)
    def fail(*args, **kwargs):
        raise HTTPException(503, 'Synthetic receipt failure')
    monkeypatch.setattr(transactions, 'remember_write', fail)
    response = post(client, 'borrow', headers[0], dict(user_id=users[2].id, book_id=book.id, copy_id=copies[0].id))
    assert response.status_code == 503
    db_session.expire_all()
    assert db_session.query(Transaction).count() == db_session.query(InventoryWrite).count() == 0
    assert db_session.get(Book, book.id).copies_available == 2


def test_keyed_borrow_preserves_holds_overdue_and_quota(client, db_session):
    users, book, copies, headers = setup(db_session)
    # Hold both copies for reservations; a walk-in cannot take them.
    other = User(name='Synthetic queued member', role='member', password_hash='unused', status='active')
    db_session.add(other); db_session.flush()
    db_session.add_all([Reservation(user_id=user_id, book_id=book.id, status='ready',
                                   expires_at=now_ph() + timedelta(hours=12)) for user_id in (users[2].id, other.id)])
    db_session.commit()
    blocked = post(client, 'borrow', headers[0], dict(user_id=users[3].id, book_id=book.id, copy_id=copies[0].id))
    assert blocked.status_code == 409 and blocked.json()['detail']['code'] == 'capacity_held'
    pickup = post(client, 'borrow', headers[0], dict(user_id=users[2].id, book_id=book.id, copy_id=copies[0].id))
    assert pickup.status_code == 201
    db_session.expire_all()
    assert db_session.query(Reservation).filter_by(user_id=users[2].id).one().status == 'fulfilled'
    tx = db_session.get(Transaction, pickup.json()['id']); tx.due_date = now_ph() - timedelta(days=2)
    extra = Book(title='Synthetic available title', author='Synthetic', category='General', copies_total=1, copies_available=1)
    db_session.add(extra); db_session.commit(); ensure_book_copies(db_session, extra.id)
    extra_copy = db_session.query(BookCopy).filter_by(book_id=extra.id).one()
    overdue = post(client, 'borrow', headers[0], dict(user_id=users[2].id, book_id=extra.id, copy_id=extra_copy.id))
    assert overdue.status_code == 409 and 'overdue' in overdue.json()['detail']
    for index in range(5):
        reserved = Book(title=f'Synthetic quota {index}', author='Synthetic', category='General', copies_total=0, copies_available=0)
        db_session.add(reserved); db_session.flush()
        db_session.add(Reservation(user_id=users[3].id, book_id=reserved.id, status='pending'))
    db_session.commit()
    quota = post(client, 'borrow', headers[0], dict(user_id=users[3].id, book_id=extra.id, copy_id=extra_copy.id))
    assert quota.status_code == 409 and quota.json()['detail']['code'] == 'quota_exceeded'
    assert db_session.query(InventoryWrite).count() == 1  # Only the confirmed pickup has a receipt.
