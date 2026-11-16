from io import BytesIO

import pytest
from models.user import User
from services.passwords import hash_password, verify_password

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture()
def staff(client, db_session):
    actor = User(name="Synthetic Librarian", email="staff@example.com", role="librarian",
                 status="active", password_hash=hash_password("Password1"))
    db_session.add(actor)
    db_session.commit()
    response = client.post("/api/auth/login", json={"email": actor.email, "password": "Password1"})
    assert response.status_code == 200
    return actor


def register(client, **extra):
    return client.post("/api/librarian/users/register", data={"name": "Synthetic New Member", "location": "Test Library", **extra})


def test_id_is_optional_and_no_contact_uses_librarian_handoff(client, db_session, staff):
    response = register(client)
    assert response.status_code == 201
    body = response.json()
    member = db_session.get(User, body["id"])
    assert member.id_image_url is None
    assert member.must_change_password
    assert not member.email_verified and not member.phone_verified
    assert body["password_delivery"] == {"channel": "librarian", "status": "manual"}
    password = body["temporary_password"]
    assert len(password) == 10
    assert any(c.islower() for c in password) and any(c.isupper() for c in password) and any(c.isdigit() for c in password)
    assert verify_password(password, member.password_hash)


def test_registration_password_is_shorter_even_when_id_is_attached(client, db_session, staff):
    response = client.post("/api/librarian/users/register", data={"name": "Synthetic With ID", "location": "Test Library"},
                           files={"id_image": ("sample.png", BytesIO(PNG), "image/png")})
    assert response.status_code == 201
    assert len(response.json()["temporary_password"]) == 10
    assert db_session.get(User, response.json()["id"]).id_image_url


@pytest.mark.parametrize("channel,contacts", [("email", {"email": "Reader@Example.com", "phone": "09123456789"}), ("sms", {"phone": "09123456789"})])
def test_accepted_delivery_hides_password_and_occurs_after_commit(client, db_session, staff, monkeypatch, channel, contacts):
    from routers import librarian
    from database import SessionLocal
    sent = []
    def send(**values):
        with SessionLocal() as other:
            member = other.query(User).filter_by(member_id=values["member_id"]).one()
            assert verify_password(values["temporary_password"], member.password_hash)
            assert not member.email_verified and not member.phone_verified
        sent.append(values)
        return {"channel": channel, "status": "accepted"}
    monkeypatch.setattr(librarian, "deliver_registration_credentials", send, raising=False)
    response = register(client, **contacts)
    assert response.status_code == 201
    body = response.json()
    assert len(sent) == 1
    assert body["password_delivery"] == {"channel": channel, "status": "accepted"}
    assert body["temporary_password"] is None
    assert "password_hash" not in body
    assert sent[0]["email"] == ("reader@example.com" if channel == "email" else None)
    assert body["phone"] == "09123456789"
    assert len(sent[0]["temporary_password"]) == 10


@pytest.mark.parametrize("status", ["unavailable", "failed"])
def test_unconfirmed_delivery_keeps_account_and_librarian_handoff(client, db_session, staff, monkeypatch, status):
    from routers import librarian
    monkeypatch.setattr(librarian, "deliver_registration_credentials", lambda **values: {"channel": "email", "status": status}, raising=False)
    response = register(client, email="reader@example.com")
    assert response.status_code == 201
    body = response.json()
    assert body["password_delivery"] == {"channel": "email", "status": status}
    member = db_session.get(User, body["id"])
    assert verify_password(body["temporary_password"], member.password_hash)
    assert member.must_change_password
    assert db_session.query(User).filter_by(role="member").count() == 1


def test_registration_without_id_does_not_access_private_storage(client, staff, monkeypatch):
    from routers import librarian
    def unexpected(**kwargs):
        raise AssertionError("No upload was provided")
    monkeypatch.setattr(librarian, "read_upload", unexpected)
    assert register(client).status_code == 201


def test_optional_id_does_not_ignore_an_invalid_upload_ticket(client, staff):
    assert register(client, upload_ticket="synthetic-invalid-ticket").status_code == 403


def test_malformed_email_is_rejected_before_account_or_delivery(client, db_session, staff, monkeypatch):
    from routers import librarian
    sent = []
    monkeypatch.setattr(librarian, "deliver_registration_credentials", lambda **values: sent.append(values), raising=False)
    response = register(client, email="not-an-email")
    assert response.status_code == 422
    assert sent == [] and db_session.query(User).filter_by(role="member").count() == 0


def test_conflicting_registration_never_sends_a_password(client, db_session, staff, monkeypatch):
    from routers import librarian
    sent = []
    monkeypatch.setattr(librarian, "deliver_registration_credentials", lambda **values: sent.append(values), raising=False)
    assert register(client, email=staff.email).status_code == 409
    assert sent == []


def test_new_credentials_are_unique_and_force_change_without_contact(client, db_session, staff):
    first = register(client).json()
    second = register(client).json()
    assert first["temporary_password"] != second["temporary_password"]
    response = client.post("/api/auth/login", json={"email": first["member_id"], "password": first["temporary_password"]})
    assert response.status_code == 200 and response.json()["must_change_password"]
    assert client.get("/api/user/profile").status_code == 200
    assert client.get("/api/user/notifications").status_code == 403


def test_optional_id_registration_is_still_librarian_only(client):
    assert register(client).status_code == 401


@pytest.mark.parametrize("role,status,expected", [("member", "active", 403), ("librarian", "suspended", 401)])
def test_optional_id_keeps_role_and_active_account_checks(client, db_session, role, status, expected):
    actor = User(name="Synthetic denied actor", email="denied@example.com", role=role, status="active", password_hash=hash_password("Password1"))
    db_session.add(actor)
    db_session.commit()
    assert client.post("/api/auth/login", json={"email": actor.email, "password": "Password1"}).status_code == 200
    actor.status = status
    db_session.commit()
    assert register(client).status_code == expected


def test_failed_member_commit_never_sends_credentials(client, db_session, staff, monkeypatch):
    from routers import librarian
    from sqlalchemy.orm import Session
    from sqlalchemy.exc import IntegrityError
    sent = []
    monkeypatch.setattr(librarian, "deliver_registration_credentials", lambda **values: sent.append(values))
    def fail_commit(self):
        raise IntegrityError("synthetic conflict", {}, Exception("synthetic"))
    monkeypatch.setattr(Session, "commit", fail_commit)
    response = register(client)
    assert response.status_code == 409
    assert sent == [] and db_session.query(User).filter_by(role="member").count() == 0
