from io import BytesIO
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

from models.user import User
from routers.auth import _make_token
from services import storage_service

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def account(db, role="member", **extra):
    user = User(name="Library Approved Name", role=role, status="active", password_hash="synthetic-unused-hash",
                phone="09123456789", location="Test Library", **extra)
    db.add(user)
    db.commit()
    token = _make_token(user.id, db)
    db.commit()
    return user, {"Authorization": "Bearer " + token}


def photo(db, user):
    path = Path("uploads/avatars") / f"{user.id}_synthetic.png"
    path.write_bytes(PNG)
    user.avatar_url = "/" + path.as_posix()
    db.commit()
    return path, user.avatar_url


@pytest.mark.parametrize("value", ["A different name", None])
def test_member_name_is_locked_and_combined_updates_are_atomic(client, db_session, value):
    user, headers = account(db_session, email="original@example.com", email_verified=True)
    response = client.put("/api/user/profile", headers=headers, json={"name": value, "phone": None,
        "location": "Changed location", "email": "changed@example.com", "role": "librarian"})
    assert response.status_code == 403
    db_session.expire_all()
    assert user.name == "Library Approved Name" and user.phone == "09123456789"
    assert user.location == "Test Library" and user.email == "original@example.com" and user.email_verified


def test_same_member_name_is_a_legacy_noop_and_other_fields_remain_editable(client, db_session):
    user, headers = account(db_session)
    response = client.put("/api/user/profile", headers=headers, json={"name": user.name, "phone": None, "location": "New location"})
    assert response.status_code == 200
    assert response.json()["name"] == "Library Approved Name" and response.json()["phone"] == "09123456789"
    assert response.json()["location"] == "New location"


def test_librarian_own_profile_name_behavior_is_preserved(client, db_session):
    _, headers = account(db_session, role="librarian")
    response = client.put("/api/user/profile", headers=headers, json={"name": "Updated Staff Name"})
    assert response.status_code == 200 and response.json()["name"] == "Updated Staff Name"


def test_remove_only_own_photo_preserves_account_id_and_other_member(client, db_session):
    user, headers = account(db_session, id_image_url="/uploads/ids/synthetic.pdf")
    own_path, _ = photo(db_session, user)
    other, _ = account(db_session)
    other_path, other_reference = photo(db_session, other)
    response = client.request("DELETE", "/api/user/avatar", headers=headers,
        params={"user_id": other.id}, json={"avatar_url": other_reference})
    assert response.status_code == 200 and response.json() == {"avatar_url": None}
    db_session.expire_all()
    assert user.avatar_url is None and user.name == "Library Approved Name" and user.status == "active"
    assert user.id_image_url == "/uploads/ids/synthetic.pdf" and db_session.query(User).count() == 2
    assert not own_path.exists() and other_path.exists() and other.avatar_url == other_reference
    assert client.get("/api/user/profile", headers=headers).status_code == 200
    assert client.delete("/api/user/avatar", headers=headers).status_code == 200


def test_removal_without_photo_is_repeatable_and_does_not_touch_storage(client, db_session, monkeypatch):
    _, headers = account(db_session)
    calls = []
    monkeypatch.setattr(storage_service, "delete_upload", lambda *args, **kwargs: calls.append(True))
    for _ in range(2):
        assert client.delete("/api/user/avatar", headers=headers).json() == {"avatar_url": None}
    assert calls == []


def test_upload_after_photo_removal_remains_available(client, db_session):
    user, headers = account(db_session)
    old_path, _ = photo(db_session, user)
    assert client.delete("/api/user/avatar", headers=headers).status_code == 200
    response = client.post("/api/user/avatar", headers=headers, files={"file": ("synthetic.png", BytesIO(PNG), "image/png")})
    assert response.status_code == 200 and response.json()["avatar_url"]
    db_session.expire_all()
    assert user.avatar_url and not old_path.exists()


def test_private_cloud_photo_uses_existing_storage_delete(client, db_session, monkeypatch):
    user, headers = account(db_session)
    monkeypatch.setitem(storage_service.BUCKETS, "avatars", "rpl-avatars")
    user.avatar_url = "supabase://rpl-avatars/synthetic.png"
    db_session.commit()
    calls = []
    monkeypatch.setattr(storage_service, "_request", lambda method, endpoint, **kwargs: calls.append((method, endpoint, kwargs)))
    response = client.delete("/api/user/avatar", headers=headers)
    assert response.status_code == 200
    assert calls == [("DELETE", "object/rpl-avatars", {"json": {"prefixes": ["synthetic.png"]}})]
    db_session.expire_all()
    assert user.avatar_url is None


@pytest.mark.parametrize("reference", ["/uploads/ids/other.pdf", "/uploads/avatars/../other.png", "https://example.invalid/photo.png", "supabase://rpl-ids/other.png"])
def test_unsafe_or_wrong_category_photo_requires_storage_review(client, db_session, monkeypatch, reference):
    user, headers = account(db_session)
    user.avatar_url = reference
    db_session.commit()
    calls = []
    monkeypatch.setattr(storage_service, "delete_upload", lambda *args, **kwargs: calls.append(True))
    assert client.delete("/api/user/avatar", headers=headers).status_code == 409
    db_session.expire_all()
    assert user.avatar_url == reference and calls == []


def test_shared_reference_does_not_delete_another_accounts_photo(client, db_session):
    user, headers = account(db_session)
    path, reference = photo(db_session, user)
    other, _ = account(db_session, avatar_url=reference)
    assert client.delete("/api/user/avatar", headers=headers).status_code == 409
    db_session.expire_all()
    assert path.exists() and user.avatar_url == reference and other.avatar_url == reference


def test_storage_failure_keeps_reference_for_retry_without_exposing_provider_detail(client, db_session, monkeypatch):
    user, headers = account(db_session)
    path, reference = photo(db_session, user)
    with monkeypatch.context() as patch:
        def fail(*args, **kwargs):
            raise HTTPException(502, "synthetic private provider detail")
        patch.setattr(storage_service, "delete_upload", fail)
        response = client.delete("/api/user/avatar", headers=headers)
        assert response.status_code == 502 and "private provider detail" not in response.text
    db_session.expire_all()
    assert user.avatar_url == reference and path.exists()
    assert client.delete("/api/user/avatar", headers=headers).status_code == 200


def test_commit_failure_after_storage_deletion_can_be_retried(client, db_session, monkeypatch):
    user, headers = account(db_session)
    path, reference = photo(db_session, user)
    with monkeypatch.context() as patch:
        def fail(self):
            raise OperationalError("synthetic commit", {}, Exception("synthetic"))
        patch.setattr(Session, "commit", fail)
        response = client.delete("/api/user/avatar", headers=headers)
        assert response.status_code == 503
    db_session.expire_all()
    assert user.avatar_url == reference and not path.exists()
    assert client.delete("/api/user/avatar", headers=headers).status_code == 200


@pytest.mark.parametrize("state,expected", [("suspended", 401), ("must_change_password", 403), ("revoked", 401)])
def test_photo_removal_respects_current_session_restrictions(client, db_session, state, expected):
    user, headers = account(db_session)
    path, _ = photo(db_session, user)
    if state == "suspended": user.status = "suspended"
    elif state == "must_change_password": user.must_change_password = True
    else: assert client.post("/api/auth/logout", headers=headers).status_code == 204
    db_session.commit()
    assert client.delete("/api/user/avatar", headers=headers).status_code == expected
    assert path.exists()


def test_anonymous_photo_removal_is_denied(client):
    assert client.delete("/api/user/avatar").status_code == 401
