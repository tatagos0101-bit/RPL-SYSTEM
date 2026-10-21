from models.user import User
from models.book import Book
from models.transaction import Transaction
from routers.auth import _make_token
from timezone_utils import now_ph
from datetime import timedelta


def test_search_pagination_and_totals_cover_rows_beyond_first_page(client, db_session):
    staff = User(name='Synthetic staff', role='librarian', password_hash='unused')
    users = [User(name=f'Synthetic {i:03}', role='member', password_hash='unused') for i in range(205)]
    books = [Book(title=f'Synthetic {i:04}', author='Author', category='General', copies_total=1, copies_available=1) for i in range(1005)]
    db_session.add_all([staff, *users, *books]); db_session.commit()
    token = _make_token(staff.id, db_session); db_session.commit()
    headers = {'Authorization': 'Bearer ' + token}
    db_session.add_all([Transaction(user_id=users[-1].id, book_id=book.id, type='return', status='returned', borrow_date=now_ph()) for book in books[:205]])
    db_session.commit()
    assert client.get('/api/librarian/users/count', headers=headers).json()['total'] == 205
    assert len(client.get('/api/librarian/users?skip=200&limit=20', headers=headers).json()) == 5
    assert client.get('/api/librarian/users?search=Synthetic%20204', headers=headers).json()[0]['id'] == users[-1].id
    assert client.get('/api/books?search=Synthetic%201004').json()['total'] == 1
    assert len(client.get('/api/books?skip=1000&limit=20').json()['items']) == 5
    counts = client.get('/api/transactions/count?search=Synthetic%20204', headers=headers).json()
    assert counts['total'] == 205 and counts['returned'] == 205
    assert len(client.get('/api/transactions?skip=200&limit=20', headers=headers).json()) == 5
    assert client.get('/api/transactions/count').status_code == 401
    member_token = _make_token(users[0].id, db_session); db_session.commit()
    assert client.get('/api/librarian/users/count', headers={'Authorization': 'Bearer ' + member_token}).status_code == 403
    due = Transaction(user_id=users[0].id, book_id=books[-1].id, type='borrow', status='overdue',
                      borrow_date=now_ph()-timedelta(days=20), due_date=now_ph()-timedelta(days=2))
    future = Transaction(user_id=users[0].id, book_id=books[-2].id, type='borrow', status='active',
                         borrow_date=now_ph(), due_date=now_ph()+timedelta(days=14))
    db_session.add_all([due, future]); db_session.commit()
    totals = client.get('/api/transactions/count?status=active', headers=headers).json()
    assert totals['total'] == 1 and totals['on_time'] == 1 and totals['overdue'] == 1
    reminder = client.post(f'/api/librarian/notify/{due.id}', headers=headers)
    assert reminder.status_code == 501 and 'No email or SMS was sent' in reminder.json()['detail']
