from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from config import FINE_PER_DAY
from models.book import Book
from models.notification import Notification
from models.transaction import Transaction
from models.user import User
from routers.auth import _hash, _make_token
from services import overdue_email, otp_delivery
from timezone_utils import PH_TZ


@pytest.fixture()
def reminder_data(db_session, monkeypatch):
    at = datetime(2026, 11, 26, 14, tzinfo=PH_TZ)
    monkeypatch.setattr(overdue_email, 'now_ph', lambda: at)
    monkeypatch.setattr(otp_delivery, 'configured', lambda channel: channel == 'email')
    staff = User(name='Synthetic Librarian', member_id='SYN-STAFF', role='librarian', password_hash=_hash('Password1'))
    member = User(name='Synthetic Borrower', member_id='SYN-MEMBER', role='member', email='borrower@example.com', email_verified=True, password_hash=_hash('Password1'))
    other = User(name='Synthetic Other Borrower', member_id='SYN-OTHER', role='member', email='other@example.com', email_verified=True, password_hash=_hash('Password1'))
    db_session.add_all([staff, member, other]); db_session.flush()
    books = [Book(title=title, author='Synthetic Author', category='General', year=2020, copies_total=1, copies_available=0)
        for title in ['Synthetic overdue first', 'Synthetic overdue second', 'Synthetic recent overdue', 'Synthetic future loan', 'Synthetic returned book', 'Other members private book']]
    db_session.add_all(books); db_session.flush()
    loans = [Transaction(user_id=member.id, book_id=books[0].id, type='borrow', status='active', borrow_date=at-timedelta(days=20), due_date=(at-timedelta(days=2,hours=4)).astimezone(timezone.utc)),
        Transaction(user_id=member.id, book_id=books[1].id, type='borrow', status='overdue', borrow_date=at-timedelta(days=20), due_date=(at-timedelta(days=3)).replace(tzinfo=None)),
        Transaction(user_id=member.id, book_id=books[2].id, type='borrow', status='active', borrow_date=at-timedelta(days=15), due_date=at-timedelta(minutes=30)),
        Transaction(user_id=member.id, book_id=books[3].id, type='borrow', status='active', borrow_date=at-timedelta(days=2), due_date=at+timedelta(days=12)),
        Transaction(user_id=member.id, book_id=books[4].id, type='return', status='returned', borrow_date=at-timedelta(days=20), due_date=at-timedelta(days=6), return_date=at-timedelta(days=4), fine_amount=Decimal('10')),
        Transaction(user_id=other.id, book_id=books[5].id, type='borrow', status='overdue', borrow_date=at-timedelta(days=20), due_date=at-timedelta(days=5))]
    db_session.add_all(loans); db_session.commit()
    # SQLite drops offsets; restore the first persisted date as a legacy PH value.
    loans[0].due_date = (at-timedelta(days=2,hours=4)).replace(tzinfo=None); db_session.commit()
    headers = [{'Authorization': 'Bearer ' + _make_token(person.id, db_session)} for person in (staff, member, other)]
    db_session.commit()
    sent = []
    monkeypatch.setattr(otp_delivery, 'send_email', lambda *args, **kwargs: sent.append((args, kwargs)))
    return {'at':at, 'staff':staff, 'member':member, 'other':other, 'loans':loans, 'headers':headers, 'sent':sent}


def test_overdue_email_contains_all_current_loans_dates_lateness_and_fines(client, db_session, reminder_data):
    data = reminder_data
    response = client.post(f'/api/librarian/notify/{data["loans"][0].id}', headers=data['headers'][0], json={'email':'ignored-recipient@example.test'})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['status'] == 'accepted' and result['overdue_books'] == 3
    assert Decimal(result['total_late_fee']) == Decimal(5 * FINE_PER_DAY)
    assert len(data['sent']) == 1
    args, options = data['sent'][0]
    assert args[0] == data['member'].email
    content = args[2]
    for text in ['Synthetic overdue first','Synthetic overdue second','Synthetic recent overdue','November 24, 2026 at 10:00 AM PHT','2 days and 4 hours overdue','3 days overdue','Less than 1 hour overdue','completed 24-hour day','assessments, not payment records']:
        assert text in content
    for text in ['Synthetic future loan','Synthetic returned book','Other members private book','ignored-recipient@example.test']:
        assert text not in content
    assert f'PHP {5 * FINE_PER_DAY:,.2f}' in content
    assert options == {'idempotency_prefix':'rpl-overdue','timeout':5,'max_attempts':1}
    assert db_session.query(Notification).filter_by(user_id=data['member'].id,type='overdue_email_sent').count() == 1
    db_session.refresh(data['loans'][0]); db_session.refresh(data['loans'][4])
    assert data['loans'][0].status == 'active' and data['loans'][0].fine_amount == 0
    assert data['loans'][4].return_date and data['loans'][4].fine_amount == 10
    assert data['member'].email not in response.text and 'ignored-recipient' not in response.text


def test_repeated_click_on_another_loan_cannot_send_a_second_reminder(client, reminder_data):
    data = reminder_data
    first = client.post(f'/api/librarian/notify/{data["loans"][0].id}', headers=data['headers'][0])
    second = client.post(f'/api/librarian/notify/{data["loans"][1].id}', headers=data['headers'][0])
    assert first.json()['status'] == 'accepted'
    assert second.status_code == 429 and int(second.headers['retry-after']) > 0
    assert len(data['sent']) == 1


@pytest.mark.parametrize('case', ['no_email','unverified','deleted','unconfigured','invalid'])
def test_unavailable_saved_contact_never_sends(client, db_session, reminder_data, monkeypatch, case):
    data = reminder_data
    if case == 'no_email': data['member'].email = None
    if case == 'unverified': data['member'].email_verified = False
    if case == 'deleted': data['member'].deleted_at = data['at']
    if case == 'unconfigured': monkeypatch.setattr(otp_delivery, 'configured', lambda channel: False)
    if case == 'invalid': data['member'].email = 'invalid-address'
    db_session.commit()
    result = client.post(f'/api/librarian/notify/{data["loans"][0].id}', headers=data['headers'][0])
    assert result.status_code in (400,422)
    assert not data['sent'] and db_session.query(Notification).count() == 0


def test_anonymous_members_and_suspended_staff_cannot_send(client, db_session, reminder_data):
    data = reminder_data
    endpoint = f'/api/librarian/notify/{data["loans"][0].id}'
    assert client.post(endpoint).status_code == 401
    for header in data['headers'][1:]: assert client.post(endpoint, headers=header).status_code == 403
    data['staff'].status = 'suspended'; db_session.commit()
    assert client.post(endpoint, headers=data['headers'][0]).status_code == 401
    assert not data['sent']


def test_returned_future_and_missing_loans_cannot_trigger_email(client, reminder_data):
    data = reminder_data
    for key in [data['loans'][3].id,data['loans'][4].id,999999]:
        assert client.post(f'/api/librarian/notify/{key}', headers=data['headers'][0]).status_code in (404,409)
    assert not data['sent']


def test_due_book_buttons_explain_contact_verification_requirements(client, db_session, reminder_data):
    data = reminder_data
    response = client.get('/api/librarian/due-books', headers=data['headers'][0])
    assert response.status_code == 200
    row = next(row for row in response.json() if row['transaction_id'] == data['loans'][0].id)
    assert row['can_email_reminder'] is True and row['email_reminder_reason'] is None
    data['member'].email_verified = False; db_session.commit()
    response = client.get('/api/librarian/due-books', headers=data['headers'][0])
    row = next(row for row in response.json() if row['transaction_id'] == data['loans'][0].id)
    assert row['can_email_reminder'] is False and 'verify' in row['email_reminder_reason']


@pytest.mark.parametrize('failure,status', [(otp_delivery.DeliveryUnavailable,'failed'),(otp_delivery.DeliveryUncertain,'unknown'),(RuntimeError,'unknown')])
def test_delivery_failure_is_never_reported_as_sent(client, db_session, reminder_data, monkeypatch, failure, status):
    data = reminder_data
    def fail(*args, **kwargs): raise failure('private provider response must not leak')
    monkeypatch.setattr(otp_delivery, 'send_email', fail)
    response = client.post(f'/api/librarian/notify/{data["loans"][0].id}', headers=data['headers'][0])
    assert response.status_code == 200 and response.json()['status'] == status
    assert 'private provider response' not in response.text and data['member'].email not in response.text
    assert db_session.query(Notification).count() == (1 if status == 'unknown' else 0)
    if status == 'unknown':
        assert client.post(f'/api/librarian/notify/{data["loans"][1].id}', headers=data['headers'][0]).status_code == 429


def test_failed_receipt_save_returns_uncertain_and_never_retries_email(db_session, reminder_data, monkeypatch):
    data = reminder_data
    def fail_commit(): raise RuntimeError('private database details')
    monkeypatch.setattr(db_session,'commit',fail_commit)
    result = overdue_email.send_overdue_reminder(db_session,data['loans'][0].id)
    assert result['status'] == 'unknown' and len(data['sent']) == 1
    assert 'private database details' not in result['message']


def test_elapsed_time_handles_utc_and_legacy_ph_dates():
    at = datetime(2026,11,26,14,tzinfo=PH_TZ)
    due = at-timedelta(days=2,hours=3)
    assert overdue_email.overdue_duration(due.astimezone(timezone.utc),at) == '2 days and 3 hours overdue'
    assert overdue_email.overdue_duration(due.replace(tzinfo=None),at) == '2 days and 3 hours overdue'
