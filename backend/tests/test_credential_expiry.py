from datetime import timedelta
import pytest
from fastapi import HTTPException
from models.user import User
from models.password_reset import PasswordResetCode
from routers.auth import _hash
from services import credential_expiry, password_reset
from timezone_utils import now_ph, as_ph


def test_reset_codes_expire_at_five_minutes_and_existing_longer_codes_are_capped(client, db_session, monkeypatch):
    user = User(name='Synthetic expiry', email='expiry@example.com', email_verified=True, password_hash=_hash('Password1'), role='member')
    db_session.add(user); db_session.commit()
    issued = now_ph()
    monkeypatch.setattr(password_reset, '_now', lambda: issued)
    response = client.post('/api/auth/password-reset/request', json={'identifier': user.email})
    assert response.status_code == 200
    challenge = db_session.query(PasswordResetCode).one()
    assert abs((as_ph(challenge.expires_at) - issued).total_seconds() - 300) < 1
    challenge.created_at = issued
    challenge.expires_at = issued + timedelta(minutes=15)
    db_session.commit()
    monkeypatch.setattr(password_reset, '_now', lambda: issued + timedelta(minutes=5))
    result = client.post('/api/auth/password-reset/confirm', json={'identifier': user.email, 'code': response.json()['debug_code'], 'new_password': 'ChangedPassword2'})
    assert result.status_code == 400


def test_temporary_password_expires_at_24_hours_including_existing_sessions(client, db_session, monkeypatch):
    issued = now_ph()
    monkeypatch.setattr(credential_expiry, 'now_ph', lambda: issued)
    deadline = credential_expiry.temporary_password_deadline()
    assert deadline == issued + timedelta(hours=24)
    user = User(name='Synthetic temp', email='temp@example.com', password_hash=_hash('Temporary1'), role='member', must_change_password=True, temporary_password_expires_at=deadline)
    db_session.add(user); db_session.commit()
    assert client.post('/api/auth/login', json={'email': user.email, 'password': 'Temporary1'}).status_code == 200
    monkeypatch.setattr(credential_expiry, 'now_ph', lambda: deadline)
    assert client.get('/api/auth/session').status_code == 403
    assert client.put('/api/user/change-password', json={'current_password': 'Temporary1', 'new_password': 'ChangedPassword2'}).status_code == 403
    client.cookies.clear()
    result = client.post('/api/auth/login', json={'email': user.email, 'password': 'Temporary1'})
    assert result.status_code == 403 and 'expired' in result.json()['detail']
    assert 'set-cookie' not in result.headers


def test_permanent_password_change_clears_the_temporary_deadline(client, db_session):
    user = User(name='Synthetic change', email='change@example.com', password_hash=_hash('Temporary1'), role='librarian', must_change_password=True, temporary_password_expires_at=now_ph() + timedelta(hours=24))
    db_session.add(user); db_session.commit()
    assert client.post('/api/auth/login', json={'email': user.email, 'password': 'Temporary1'}).status_code == 200
    assert client.put('/api/user/change-password', json={'current_password': 'Temporary1', 'new_password': 'ChangedPassword2'}).status_code == 200
    db_session.refresh(user)
    assert user.temporary_password_expires_at is None and not user.must_change_password


def test_email_templates_state_the_correct_lifetimes(monkeypatch):
    from services import otp_delivery, registration_delivery
    sent = []
    monkeypatch.setattr(otp_delivery, 'send_email', lambda *args, **kwargs: sent.append(args[2]))
    otp_delivery.send_code('email', 'synthetic@example.com', '123456', 'reset')
    assert '5 minutes' in sent[-1]
    otp_delivery.send_code('email', 'synthetic@example.com', '123456', 'verify')
    assert '15 minutes' in sent[-1]
    registration_delivery.send_registration_email(destination='synthetic@example.com', member_id='SYN-1', temporary_password='Synthetic1')
    assert '24 hours' in sent[-1]
