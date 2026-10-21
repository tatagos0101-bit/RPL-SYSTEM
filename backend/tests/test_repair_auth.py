import pytest
from passlib.hash import bcrypt
from models.user import User
from routers.auth import _hash, _make_token


def test_mixed_case_signup_and_legacy_email_login(client, db_session):
    response = client.post("/api/auth/signup", json={"name": "Fixture", "email": "MixedCase@example.com", "password": "Password1"})
    assert response.status_code == 201
    user = db_session.get(User, response.json()["user_id"])
    assert user.email == "mixedcase@example.com"
    user.email = "MixedCase@example.com"
    db_session.commit()
    assert client.post("/api/auth/login", json={"email": "MIXEDCASE@example.com", "password": "Password1"}).status_code == 200


def test_case_collision_never_selects_an_identity(client, db_session):
    for email in ("Case@example.com", "case@example.com"):
        db_session.add(User(name="Fixture", email=email, role="member", password_hash=_hash("Password1")))
    db_session.commit()
    assert client.post("/api/auth/login", json={"email": "case@example.com", "password": "Password1"}).status_code == 401
    assert client.post("/api/auth/signup", json={"name": "Fixture", "email": "CASE@example.com", "password": "Password1"}).status_code == 400


def test_new_hash_uses_all_password_bytes():
    from services.passwords import hash_password, verify_password
    password = "A1" * 36 + "first"
    hashed = hash_password(password)
    assert hashed.startswith("$bcrypt-sha256$")
    assert verify_password(password, hashed)
    assert not verify_password("A1" * 36 + "different", hashed)


def test_long_legacy_login_requires_replacement_without_adopting_suffix(client, db_session):
    old_hash = bcrypt.hash("A1" * 36 + "old")
    user = User(name="Fixture", member_id="RPL-LEGACY", role="member", password_hash=old_hash)
    db_session.add(user); db_session.commit()
    response = client.post("/api/auth/login", json={"email": user.member_id, "password": "A1" * 36 + "other"})
    assert response.status_code == 200 and response.json()["must_change_password"]
    db_session.refresh(user)
    assert user.password_hash == old_hash
    assert client.get("/api/user/loans").status_code == 403


@pytest.mark.parametrize("password", ["short1", "nodigitsatall", "A1" * 65])
def test_password_policy_is_consistent(password):
    from pydantic import ValidationError
    from schemas.user import ChangePasswordRequest
    from schemas.auth import PasswordResetConfirmRequest
    with pytest.raises(ValidationError):
        ChangePasswordRequest(current_password="Password1", new_password=password)
    with pytest.raises(ValidationError):
        PasswordResetConfirmRequest(identifier="RPL-TEST", code="123456", new_password=password)


def test_suspension_revokes_existing_sessions(client, db_session):
    member = User(name="Fixture", role="member", password_hash=_hash("Password1"))
    staff = User(name="Staff", role="librarian", password_hash=_hash("Password1"))
    db_session.add_all([member, staff]); db_session.commit()
    mh = {"Authorization": "Bearer " + _make_token(member.id, db_session)}
    sh = {"Authorization": "Bearer " + _make_token(staff.id, db_session)}
    db_session.commit()
    for state in ("suspended", "active"):
        assert client.put(f"/api/librarian/users/{member.id}/status", headers=sh, json={"status": state}).status_code == 200
    assert client.get("/api/user/profile", headers=mh).status_code == 401
