import pytest

from models.user import User
from routers.auth import _hash


@pytest.mark.parametrize("role", ["member", "librarian"])
def test_first_login_password_change_returns_confirmed_state_and_persists(client, db_session, role):
    user = User(name="First login QA", member_id="RPL-FIRST", role=role,
                password_hash=_hash("TemporaryPass1"), must_change_password=True)
    db_session.add(user)
    db_session.commit()
    login = client.post("/api/auth/login", json={"email": user.member_id, "password": "TemporaryPass1"})
    assert login.json()["must_change_password"] is True
    changed = client.put("/api/user/change-password", json={"current_password": "TemporaryPass1", "new_password": "NewPassword2"})
    assert changed.status_code == 200
    assert changed.json()["success"] is True
    assert changed.json()["role"] == role
    assert changed.json()["id"] == user.id
    assert changed.json()["must_change_password"] is False
    assert "NewPassword2" not in changed.text
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
    response = client.put("/api/user/change-password", json={"current_password": "WrongPassword1", "new_password": "NewPassword2"})
    assert response.status_code == 400
    assert client.get("/api/user/profile").json()["must_change_password"] is True
