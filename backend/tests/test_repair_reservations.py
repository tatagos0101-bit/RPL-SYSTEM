from datetime import timedelta
from uuid import uuid4
import pytest
from models.user import User
from models.book import Book
from models.reservation import Reservation
from models.transaction import Transaction
from routers.auth import _make_token
from timezone_utils import now_ph


@pytest.fixture
def data(db_session):
    member = User(name='Synthetic member', role='member', password_hash='unused')
    other = User(name='Synthetic other', role='member', password_hash='unused')
    staff = User(name='Synthetic staff', role='librarian', password_hash='unused')
    books = [Book(title=f'Synthetic {i}', author='Author', category='General', copies_total=1, copies_available=1) for i in range(8)]
    db_session.add_all([member, other, staff, *books]); db_session.commit()
    headers = [{'Authorization': 'Bearer ' + _make_token(u.id, db_session)} for u in (member, other, staff)]
    db_session.commit()
    return member, other, staff, books, headers


def confirm(client, headers, books, queue=False, key=None):
    return client.post('/api/reservations/confirm', headers=headers, json={'request_id': key or str(uuid4()),
        'selections': [{'book_id': b.id, 'accept_queue': queue} for b in books]})


def test_five_slots_atomic_retry_and_key_conflict(client, db_session, data):
    member, _, _, books, h = data
    key = str(uuid4())
    first = confirm(client, h[0], books[:5], key=key)
    assert first.status_code == 201, first.text
    assert first.json()['capacity']['remaining_slots'] == 0
    assert confirm(client, h[0], books[:5], key=key).json()['reservations'] == first.json()['reservations']
    assert confirm(client, h[0], books[5:6], key=key).status_code == 409
    blocked = confirm(client, h[0], books[5:6])
    assert blocked.status_code == 409 and blocked.json()['detail']['code'] == 'quota_exceeded'
    assert db_session.query(Reservation).filter_by(user_id=member.id).count() == 5


def test_competing_capacity_requires_explicit_queue_and_atomic_batch(client, db_session, data):
    _, other, _, books, h = data
    assert confirm(client, h[0], books[:1]).status_code == 201
    conflict = confirm(client, h[1], books[:2])
    assert conflict.status_code == 409
    assert conflict.json()['detail']['code'] == 'availability_changed'
    assert db_session.query(Reservation).filter_by(user_id=other.id).count() == 0
    accepted = confirm(client, h[1], books[:2], queue=True)
    assert accepted.status_code == 201
    assert [r['status'] for r in accepted.json()['reservations']] == ['pending', 'ready']


def test_loans_and_reservations_share_quota_and_pickup_converts(client, db_session, data):
    member, _, _, books, h = data
    for book in books[:3]:
        assert client.post('/api/transactions/borrow', headers=h[2], json={'user_id': member.id, 'book_id': book.id}).status_code == 201
    assert confirm(client, h[0], books[3:5]).status_code == 201
    assert confirm(client, h[0], books[5:6]).status_code == 409
    assert client.post('/api/transactions/borrow', headers=h[2], json={'user_id': member.id, 'book_id': books[3].id}).status_code == 201
    assert client.get('/api/user/borrowing-capacity', headers=h[0]).json()['remaining_slots'] == 0
    assert client.post('/api/transactions/borrow', headers=h[2], json={'user_id': member.id, 'book_id': books[5].id}).status_code == 409
    assert client.post('/api/transactions/return', headers=h[2], json={'user_id': member.id, 'book_id': books[0].id}).status_code == 200
    assert client.get('/api/user/borrowing-capacity', headers=h[0]).json()['remaining_slots'] == 1


def test_expiry_promotes_fifo_without_extending_pending_timer(client, db_session, data):
    _, other, _, books, h = data
    first = confirm(client, h[0], books[:1]).json()['reservations'][0]
    pending = confirm(client, h[1], books[:1], queue=True).json()['reservations'][0]
    assert pending['expires_at'] is None
    ready = db_session.get(Reservation, first['id']); ready.expires_at = now_ph() - timedelta(seconds=1); db_session.commit()
    response = client.get('/api/reservations', headers=h[1])
    assert response.status_code == 200
    assert response.json()[0]['status'] == 'ready'
    assert response.json()[0]['expires_at']
    assert client.get('/api/reservations', headers=h[1]).json()[0]['expires_at'] == response.json()[0]['expires_at']


def test_ready_holds_block_walkins_and_wrong_roles(client, data):
    _, other, _, books, h = data
    assert confirm(client, h[0], books[:1]).status_code == 201
    assert client.post('/api/transactions/borrow', headers=h[2], json={'user_id': other.id, 'book_id': books[0].id}).status_code == 409
    assert confirm(client, h[2], books[1:2]).status_code == 403
    assert confirm(client, {}, books[1:2]).status_code == 401


def test_cancellation_expiry_and_history_protection(client, db_session, data):
    member, _, _, books, h = data
    rows = confirm(client, h[0], books[:5]).json()['reservations']
    assert client.delete(f"/api/reservations/{rows[0]['id']}", headers=h[1]).status_code == 404
    assert client.delete(f"/api/reservations/{rows[0]['id']}", headers=h[0]).status_code == 204
    assert client.get('/api/user/borrowing-capacity', headers=h[0]).json()['remaining_slots'] == 1
    expired = db_session.get(Reservation, rows[1]['id']); expired.expires_at = now_ph() - timedelta(seconds=1); db_session.commit()
    assert client.get('/api/user/borrowing-capacity', headers=h[0]).json()['remaining_slots'] == 2
    assert confirm(client, h[0], books[5:7]).status_code == 201
    assert client.delete(f'/api/inventory/books/{books[0].id}', headers=h[2]).status_code == 409
    member.status = 'suspended'; db_session.commit()
    assert confirm(client, h[0], books[7:8]).status_code == 401


def test_five_loans_and_existing_overlimit_records_block_only_new_commitments(client, db_session, data):
    member, _, _, books, h = data
    for book in books[:5]:
        assert client.post('/api/transactions/borrow', headers=h[2], json={'user_id': member.id, 'book_id': book.id}).status_code == 201
    assert confirm(client, h[0], books[5:6]).status_code == 409
    assert client.post('/api/transactions/borrow', headers=h[2], json={'user_id': member.id, 'book_id': books[5].id}).status_code == 409
    extra = Reservation(user_id=member.id, book_id=books[5].id, status='pending')
    db_session.add(extra); db_session.commit()
    assert confirm(client, h[0], books[6:7]).status_code == 409
    assert client.delete(f'/api/reservations/{extra.id}', headers=h[0]).status_code == 204
    assert client.post('/api/transactions/return', headers=h[2], json={'user_id': member.id, 'book_id': books[0].id}).status_code == 200


def test_inventory_resize_protects_holds_and_fills_all_fifo_slots(client, db_session, data):
    from models.book_copy import BookCopy
    from services.book_copy_service import ensure_book_copies
    member, other, _, books, h = data
    book = books[0]
    ensure_book_copies(db_session, book.id)
    original_copy = db_session.query(BookCopy).filter_by(book_id=book.id).one().id
    confirm(client, h[0], [book])
    confirm(client, h[1], [book], queue=True)
    third = User(name='Synthetic third', role='member', password_hash='unused')
    db_session.add(third); db_session.flush()
    queued = Reservation(user_id=third.id, book_id=book.id, status='pending', reserved_at=now_ph() + timedelta(seconds=1))
    db_session.add(queued); db_session.commit()
    result = client.put(f'/api/inventory/books/{book.id}', headers=h[2], json={'copies_total': 3})
    assert result.status_code == 200, result.text
    db_session.expire_all()
    rows = db_session.query(Reservation).filter_by(book_id=book.id).order_by(Reservation.reserved_at, Reservation.id).all()
    assert [r.user_id for r in rows] == [member.id, other.id, third.id]
    assert all(r.status == 'ready' and r.expires_at for r in rows)
    rejected = client.put(f'/api/inventory/books/{book.id}', headers=h[2], json={'copies_total': 1, 'title': 'Must not save'})
    assert rejected.status_code == 409
    db_session.expire_all()
    assert db_session.get(Book, book.id).copies_total == 3
    assert db_session.get(BookCopy, original_copy).status == 'available'
    assert db_session.get(Book, book.id).title != 'Must not save'


def test_older_queue_has_priority_over_new_confirmation(client, db_session, data):
    member, other, _, books, h = data
    queued = Reservation(user_id=member.id, book_id=books[0].id, status='pending', reserved_at=now_ph()-timedelta(days=1))
    db_session.add(queued); db_session.commit()
    response = confirm(client, h[1], books[:1], queue=True)
    assert response.status_code == 201
    assert response.json()['reservations'][0]['status'] == 'pending'
    db_session.expire_all()
    assert db_session.get(Reservation, queued.id).status == 'ready'
