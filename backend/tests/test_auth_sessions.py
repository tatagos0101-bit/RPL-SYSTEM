from datetime import timedelta
from io import BytesIO

import pytest
import jwt
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

import config
import database
from models.auth_session import AuthSession
from models.user import User
from routers.auth import _hash, _make_token
from services.auth_sessions import create_session_token
from timezone_utils import now_ph


def account(db, role="member", restricted=False):
    user = User(name="Synthetic account", member_id=f"RPL-{role.upper()}",
                email=f"{role}@example.test", role=role, password_hash=_hash("Password1"),
                must_change_password=restricted, email_verified=True)
    db.add(user)
    db.commit()
    return user


def login(client, user):
    response = client.post("/api/auth/login", json={"email": user.email, "password": "Password1"})
    assert response.status_code == 200
    return response.json()["access_token"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_logout_revokes_only_presented_session_and_is_idempotent(client, db_session):
    user = account(db_session)
    first = login(client, user)
    second = login(client, user)
    client.cookies.clear()
    assert client.post("/api/auth/logout", headers=bearer(first)).status_code == 204
    assert client.get("/api/user/profile", headers=bearer(first)).status_code == 401
    assert client.get("/api/user/profile", headers=bearer(second)).status_code == 200
    assert client.post("/api/auth/logout", headers=bearer(first)).status_code == 204
    assert client.post("/api/auth/logout").status_code == 204


def test_logout_revokes_cookie_and_clears_it(client, db_session):
    token = login(client, account(db_session))
    result = client.post("/api/auth/logout")
    assert result.status_code == 204
    assert "Max-Age=0" in result.headers["set-cookie"]
    assert client.get("/api/user/profile", headers=bearer(token)).status_code == 401


def test_password_change_invalidates_all_old_sessions_but_rotates_current_cookie(client, db_session):
    user = account(db_session)
    first, second = login(client, user), login(client, user)
    result = client.put("/api/user/change-password", json={
        "current_password": "Password1", "new_password": "ChangedPassword2",
    })
    assert result.status_code == 200
    assert "HttpOnly" in result.headers["set-cookie"]
    assert client.get("/api/user/notifications").status_code == 200
    for token in (first, second):
        assert client.get("/api/user/profile", headers=bearer(token)).status_code == 401
    assert db_session.query(AuthSession).filter_by(user_id=user.id).count() == 1


@pytest.mark.parametrize("role", ["member", "librarian"])
def test_temporary_password_session_cannot_skip_server_restriction(client, db_session, role):
    user = account(db_session, role, restricted=True)
    token = login(client, user)
    assert client.get("/api/user/profile", headers=bearer(token)).status_code == 200
    assert client.get("/api/user/notifications", headers=bearer(token)).status_code == 403
    assert client.put("/api/user/profile", headers=bearer(token), json={"name": "Changed"}).status_code == 403
    assert client.get("/api/librarian/users", headers=bearer(token)).status_code == 403
    assert client.post("/api/auth/enroll-face", headers=bearer(token),
                       json={"image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD"}).status_code == 403
    assert client.put("/api/user/change-password", headers=bearer(token), json={
        "current_password": "Password1", "new_password": "ChangedPassword2",
    }).status_code == 200
    assert client.get("/api/user/notifications").status_code == 200


def test_password_hash_binding_rejects_session_created_from_old_snapshot(client, db_session):
    user = account(db_session)
    # Simulate a login that verified the password before another request reset it.
    old_hash = user.password_hash
    db_session.query(User).filter_by(id=user.id).update(
        {"password_hash": _hash("ChangedPassword2")}, synchronize_session=False,
    )
    assert user.password_hash == old_hash
    token = create_session_token(db_session, user)
    db_session.commit()
    assert client.get("/api/user/profile", headers=bearer(token)).status_code == 401


def test_expired_missing_wrong_owner_and_legacy_sessions_are_rejected(client, db_session):
    member = account(db_session)
    staff = account(db_session, "librarian")
    token = login(client, member)
    claims = jwt.decode(token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
    session = db_session.get(AuthSession, claims["sid"])
    session.expires_at = now_ph() - timedelta(seconds=1)
    db_session.commit()
    assert client.get("/api/user/profile", headers=bearer(token)).status_code == 401
    active_claims = jwt.decode(_make_token(member.id), config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
    for extra in ({}, {"scope": "upload"}, {"scope": "session", "sid": "a" * 64},
                  {"scope": "session", "sid": active_claims["sid"], "sub": str(staff.id)}):
        forged = jwt.encode({"sub": str(member.id), "exp": now_ph() + timedelta(minutes=5), **extra},
                            config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
        assert client.get("/api/user/profile", headers=bearer(forged)).status_code == 401


def test_librarian_reset_revokes_member_sessions_and_requires_change(client, db_session):
    member = account(db_session)
    old = login(client, member)
    staff = account(db_session, "librarian")
    staff_token = login(client, staff)
    result = client.post(f"/api/librarian/users/{member.id}/reset-password", headers=bearer(staff_token))
    assert result.status_code == 200
    assert client.get("/api/user/profile", headers=bearer(old)).status_code == 401
    assert client.get("/api/librarian/users", headers=bearer(staff_token)).status_code == 200
    temporary = client.post("/api/auth/login", json={
        "email": member.email, "password": result.json()["temporary_password"],
    })
    assert temporary.status_code == 200
    assert client.get("/api/user/notifications").status_code == 403


def test_recovery_revokes_sessions_and_all_outstanding_reset_codes(client, db_session):
    member = account(db_session)
    old = login(client, member)
    from services.password_reset import create_password_reset_code
    first, _ = create_password_reset_code(db_session, member, "email")
    second, _ = create_password_reset_code(db_session, member, "email")
    assert client.post("/api/auth/password-reset/confirm", json={
        "identifier": member.email, "code": first, "new_password": "ChangedPassword2",
    }).status_code == 200
    assert client.get("/api/user/profile", headers=bearer(old)).status_code == 401
    assert client.post("/api/auth/password-reset/confirm", json={
        "identifier": member.email, "code": second, "new_password": "AnotherPassword3",
    }).status_code == 400


def test_registration_does_not_assert_contact_ownership(client, db_session):
    staff = account(db_session, "librarian")
    login(client, staff)
    result = client.post("/api/librarian/users/register", data={
        "name": "New synthetic member", "email": "new@example.test",
        "phone": "+63 900 000 0000", "location": "Test location",
    }, files={"id_image": ("id.png", BytesIO(b"\x89PNG\r\n\x1a\n" + b"synthetic"), "image/png")})
    assert result.status_code == 201
    assert result.json()["email_verified"] is False
    assert result.json()["phone_verified"] is False
    db_session.refresh(staff)
    assert staff.email_verified is True  # Existing records are not rewritten.


def test_session_table_upgrade_is_additive_and_repeatable(monkeypatch):
    engine = create_engine("sqlite+pysqlite://")
    database.Base.metadata.create_all(engine, tables=[t for t in database.Base.metadata.sorted_tables
                                                     if t.name != "auth_sessions"])
    with Session(engine) as db:
        member = account(db)
        member_id = member.id
    monkeypatch.setattr(database, "engine", engine)
    database.init_db()
    database.init_db()
    assert "auth_sessions" in inspect(engine).get_table_names()
    with Session(engine) as db:
        member = db.get(User, member_id)
        assert member.email_verified is True
        assert db.query(AuthSession).count() == 0
    engine.dispose()
