from datetime import timedelta

import pytest

from models.password_reset import PasswordResetCode
from models.user import User
from routers import auth
from services import otp_delivery
from services.password_reset import issue_code
from timezone_utils import now_ph


@pytest.fixture
def delivery(monkeypatch):
    sent = []
    monkeypatch.setattr(otp_delivery, "configured", lambda channel: True)
    monkeypatch.setattr(otp_delivery, "send_code", lambda *args: sent.append(args))
    return sent


def account(client, db, role="member"):
    user = User(name="Synthetic OTP member", member_id="RPL-OTP01", email="otp@example.test",
                phone="09123456789", role=role, password_hash=auth._hash("Password1"),
                email_verified=False, phone_verified=False)
    db.add(user); db.commit()
    response = client.post("/api/auth/login", json={"email": user.member_id, "password": "Password1"})
    assert response.status_code == 200
    return user


@pytest.mark.parametrize("role", ["member", "librarian"])
@pytest.mark.parametrize("channel,field", [("email", "email_verified")])
def test_verify_then_recover_with_single_use_code(client, db_session, monkeypatch, delivery, role, channel, field):
    user = account(client, db_session, role)
    requested = client.post("/api/auth/contact-verification/request", json={"channel": channel, "password": "Password1"})
    assert requested.status_code == 200
    code = delivery[-1][2]
    assert code not in requested.text
    verified = client.post("/api/auth/contact-verification/confirm", json={"channel": channel, "code": code})
    assert verified.status_code == 200
    assert client.post("/api/auth/contact-verification/confirm", json={"channel": channel, "code": code}).status_code == 400
    db_session.refresh(user)
    assert getattr(user, field)
    challenge = db_session.query(PasswordResetCode).one()
    challenge.created_at = now_ph() - timedelta(minutes=2)
    db_session.commit()
    monkeypatch.setattr(auth, "ENVIRONMENT", "production")
    response = client.post("/api/auth/password-reset/request", json={"identifier": user.member_id, "channel": channel})
    assert response.status_code == 200 and not response.json().get("debug_code")
    reset_code = delivery[-1][2]
    assert delivery[-1][3] == "reset"
    assert client.post("/api/auth/password-reset/confirm", json={"identifier": user.email, "code": reset_code, "new_password": "ChangedPassword2"}).status_code == 200
    assert client.get("/api/user/profile").status_code == 401  # old session revoked
    assert client.post("/api/auth/login", json={"email": user.member_id, "password": "ChangedPassword2"}).status_code == 200


def test_verify_requires_authenticated_password_and_does_not_allow_cross_purpose(client, db_session, delivery):
    payload = {"channel": "email", "password": "Password1"}
    assert client.post("/api/auth/contact-verification/request", json=payload).status_code == 401
    user = account(client, db_session)
    assert client.post("/api/auth/contact-verification/request", json={**payload, "password": "WrongPassword1"}).status_code == 400
    assert not delivery
    assert client.post("/api/auth/contact-verification/request", json=payload).status_code == 200
    code = delivery[-1][2]
    assert client.post("/api/auth/password-reset/confirm", json={"identifier": user.email, "code": code, "new_password": "ChangedPassword2"}).status_code == 400
    assert client.post("/api/auth/contact-verification/request", json=payload).status_code == 429


def test_failed_attempts_lock_code_across_requests(client, db_session, delivery):
    account(client, db_session)
    client.post("/api/auth/contact-verification/request", json={"channel": "email", "password": "Password1"})
    code = delivery[-1][2]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert client.post("/api/auth/contact-verification/confirm", json={"channel": "email", "code": wrong}).status_code == 400
    assert client.post("/api/auth/contact-verification/confirm", json={"channel": "email", "code": code}).status_code == 400
    db_session.expire_all()
    assert db_session.query(PasswordResetCode).one().attempts == 5


@pytest.mark.parametrize("change", ["contact", "password", "expired", "suspended", "deleted"])
def test_context_changes_reject_old_verification(client, db_session, delivery, change):
    user = account(client, db_session)
    client.post("/api/auth/contact-verification/request", json={"channel": "email", "password": "Password1"})
    code = delivery[-1][2]
    if change == "contact":
        user.email = "changed@example.test"
    elif change == "password":
        user.password_hash = auth._hash("ChangedPassword2")
    elif change == "expired":
        db_session.query(PasswordResetCode).one().expires_at = now_ph() - timedelta(seconds=1)
    elif change == "suspended":
        user.status = "suspended"
    else:
        user.deleted_at = now_ph()
    db_session.commit()
    assert client.post("/api/auth/contact-verification/confirm", json={"channel": "email", "code": code}).status_code in (400, 401, 403)
    db_session.refresh(user)
    assert not user.email_verified


def test_delivery_failure_invalidates_code_and_does_not_expose_provider_error(client, db_session, monkeypatch, delivery):
    account(client, db_session)
    monkeypatch.setattr(otp_delivery, "send_code", lambda *args: (_ for _ in ()).throw(otp_delivery.DeliveryUnavailable("private provider detail")))
    response = client.post("/api/auth/contact-verification/request", json={"channel": "email", "password": "Password1"})
    assert response.status_code == 503
    assert "private provider detail" not in response.text
    challenge = db_session.query(PasswordResetCode).one()
    assert challenge.used_at and not challenge.delivered_at


def test_production_recovery_is_generic_and_skips_unverified_accounts(client, db_session, monkeypatch, delivery):
    user = account(client, db_session)
    monkeypatch.setattr(auth, "ENVIRONMENT", "production")
    bodies = [client.post("/api/auth/password-reset/request", json={"identifier": value}).json()
              for value in [user.email, user.member_id, "unknown@example.test"]]
    assert bodies[0] == bodies[1] == bodies[2]
    assert not bodies[0].get("debug_code") and not bodies[0].get("delivery_channel")
    assert not delivery
    failures = [client.post("/api/auth/password-reset/confirm", json={
        "identifier": value, "code": "000000", "new_password": "ChangedPassword2"})
        for value in (user.email, "unknown@example.test")]
    assert all(response.status_code == 400 for response in failures)
    assert failures[0].json() == failures[1].json()


def test_missing_configuration_never_marks_contact_verified(client, db_session, monkeypatch):
    user = account(client, db_session)
    monkeypatch.setattr(otp_delivery, "configured", lambda channel: False)
    assert client.post("/api/auth/contact-verification/request", json={"channel": "email", "password": "Password1"}).status_code == 503
    db_session.refresh(user)
    assert not user.email_verified and db_session.query(PasswordResetCode).count() == 0


def test_codes_are_bound_to_owner_and_channel(client, db_session, delivery):
    owner = account(client, db_session)
    owner_token = auth._make_token(owner.id)
    assert client.post("/api/auth/contact-verification/request", json={"channel": "email", "password": "Password1"}).status_code == 200
    code = delivery[-1][2]
    other = User(name="Other synthetic", role="member", password_hash=auth._hash("Password1"), email="other@example.test")
    db_session.add(other); db_session.commit()
    payload = {"channel": "email", "code": code}
    assert client.post("/api/auth/contact-verification/confirm", json=payload,
                       headers={"Authorization": "Bearer " + auth._make_token(other.id)}).status_code == 400
    assert client.post("/api/auth/contact-verification/confirm", json={**payload, "channel": "sms"},
                       headers={"Authorization": "Bearer " + owner_token}).status_code == 422
    assert client.post("/api/auth/contact-verification/confirm", json=payload,
                       headers={"Authorization": "Bearer " + owner_token}).status_code == 200
    db_session.refresh(other)
    assert not other.email_verified


@pytest.mark.parametrize("role", ["member", "librarian"])
def test_phone_edit_is_contact_only_and_email_change_requires_password(client, db_session, delivery, role):
    user = account(client, db_session, role)
    user.email_verified = True
    db_session.commit()
    assert client.post("/api/auth/contact-verification/request", json={"channel": "email", "password": "Password1"}).status_code == 200
    code = delivery[-1][2]
    changed = client.put("/api/user/profile", json={"phone": "09999999999", "phone_verified": True})
    assert changed.status_code == 200 and changed.json()["phone"] == "09999999999"
    assert changed.json()["email_verified"] is True and changed.json()["phone_verified"] is False
    assert client.post("/api/auth/contact-verification/request", json={"channel": "sms", "password": "Password1"}).status_code == 422
    assert client.put("/api/user/profile", json={"email": "new@example.com"}).status_code == 400
    changed = client.put("/api/user/profile", json={"email": "NEW@example.com", "current_password": "Password1", "email_verified": True})
    assert changed.status_code == 200 and changed.json()["email"] == "new@example.com"
    assert changed.json()["email_verified"] is False
    assert client.post("/api/auth/contact-verification/confirm", json={"channel": "email", "code": code}).status_code == 400
    assert client.post("/api/auth/login", json={"email": "new@example.com", "password": "Password1"}).status_code == 200


def test_email_edit_rejects_conflicting_identity_and_null(client, db_session):
    account(client, db_session)
    other = User(name="Other", email="TAKEN@example.com", password_hash=auth._hash("Password1"), role="member")
    db_session.add(other); db_session.commit()
    assert client.put("/api/user/profile", json={"email": "taken@example.com", "current_password": "Password1"}).status_code == 409
    assert client.put("/api/user/profile", json={"email": None, "current_password": "Password1"}).status_code == 422


def test_preexisting_sms_code_cannot_be_redeemed(client, db_session):
    from services.password_reset import consume_code, _hash_code
    from fastapi import HTTPException
    user = account(client, db_session)
    user.phone_verified = True
    db_session.add(PasswordResetCode(user_id=user.id, channel="sms", purpose="reset", context_hash="legacy",
        code_hash=_hash_code(f"{user.id}:reset:sms:123456"), expires_at=now_ph() + timedelta(minutes=15), delivered_at=now_ph()))
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        consume_code(db_session, user, "123456", "reset")
    assert error.value.status_code == 400
