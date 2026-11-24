import pytest

from models.user import User
from routers.auth import _hash


@pytest.mark.parametrize("role", ["member", "librarian"])
@pytest.mark.parametrize("include_current", [False, True])
def test_first_login_password_change_returns_confirmed_state_and_persists(client, db_session, role, include_current):
    user = User(name="First login QA", member_id="RPL-FIRST", role=role,
                password_hash=_hash("TemporaryPass1"), must_change_password=True)
    db_session.add(user)
    db_session.commit()
    login = client.post("/api/auth/login", json={"email": user.member_id, "password": "TemporaryPass1"})
    assert login.json()["must_change_password"] is True
    assert login.json()["requires_privacy_consent"] is False
    payload = {"new_password": "NewPassword2"}
    if include_current:
        payload["current_password"] = "TemporaryPass1"
    changed = client.put("/api/user/change-password", json=payload)
    assert changed.status_code == 200
    assert changed.json()["success"] is True
    assert changed.json()["role"] == role
    assert changed.json()["id"] == user.id
    assert changed.json()["must_change_password"] is False
    assert "NewPassword2" not in changed.text
    assert "HttpOnly" in changed.headers["set-cookie"]
    assert client.get("/api/user/profile", headers={"Authorization": "Bearer " + login.json()["access_token"]}).status_code == 401
    assert client.get("/api/user/profile").json()["must_change_password"] is False
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": user.member_id, "password": "TemporaryPass1"}).status_code == 401
    login = client.post("/api/auth/login", json={"email": user.member_id, "password": "NewPassword2"})
    assert login.status_code == 200 and login.json()["must_change_password"] is False


@pytest.mark.parametrize("role", ["member", "librarian"])
def test_rejected_password_change_keeps_first_login_requirement(client, db_session, role):
    user = User(name="First login QA", member_id="RPL-FIRST", role=role,
                password_hash=_hash("TemporaryPass1"), must_change_password=True)
    db_session.add(user)
    db_session.commit()
    client.post("/api/auth/login", json={"email": user.member_id, "password": "TemporaryPass1"})
    response = client.put("/api/user/change-password", json={"new_password": "short"})
    assert response.status_code == 422
    assert client.get("/api/user/profile").json()["must_change_password"] is True


@pytest.mark.parametrize("role", ["member", "librarian"])
@pytest.mark.parametrize("current", [None, "WrongPassword1"])
def test_normal_password_change_still_requires_current_password(client, db_session, role, current):
    user = User(name="Normal password QA", member_id="RPL-NORMAL", role=role,
                password_hash=_hash("PermanentPass1"))
    db_session.add(user)
    db_session.commit()
    client.post("/api/auth/login", json={"email": user.member_id, "password": "PermanentPass1"})
    payload = {"new_password": "NewPassword2", "must_change_password": True}
    if current is not None:
        payload["current_password"] = current
    response = client.put("/api/user/change-password", json=payload)
    assert response.status_code == 400
    assert client.post("/api/auth/login", json={"email": user.member_id, "password": "PermanentPass1"}).status_code == 200


def test_initial_password_setup_requires_an_authenticated_session(client):
    assert client.put("/api/user/change-password", json={"new_password": "NewPassword2"}).status_code == 401


def test_password_recovery_cannot_complete_pending_member_setup(client, db_session):
    member = User(name="Synthetic Pending Member", email="setup@example.com", email_verified=True,
                  password_hash=_hash("TemporaryPass1"), must_change_password=True, privacy_consent_pending=True)
    db_session.add(member)
    db_session.commit()
    requested = client.post("/api/auth/password-reset/request", json={"identifier": member.email})
    assert requested.status_code == 200
    reset = client.post("/api/auth/password-reset/confirm", json={
        "identifier": member.email, "code": requested.json()["debug_code"], "new_password": "RecoveredPass2",
    })
    assert reset.status_code == 200
    logged_in = client.post("/api/auth/login", json={"email": member.email, "password": "RecoveredPass2"})
    assert logged_in.status_code == 200
    assert logged_in.json()["must_change_password"] is True
    assert logged_in.json()["requires_privacy_consent"] is True
    assert client.get("/api/user/notifications").status_code == 403
