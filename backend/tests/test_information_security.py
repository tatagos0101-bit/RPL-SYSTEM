import logging
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from models.user import User
from models.entry_log import EntryLog
from routers import auth
from middleware.security import SecurityMiddleware
from logger import security_logger


def member(db, *, status="active", email="audit@example.test"):
    user = User(name="Private Name", email=email, password_hash=auth._hash("Password1"),
                role="member", member_id="RPL-AUDIT", status=status,
                email_verified=True, phone_verified=False)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_invalid_password_and_pin_are_not_reflected(client):
    sentinel = "PRIVATE_SENTINEL_" * 12
    response = client.post("/api/auth/login", json={"email": "RPL-AUDIT", "password": sentinel})
    assert response.status_code == 422
    assert sentinel not in response.text
    assert all("input" not in e and "ctx" not in e for e in response.json()["detail"])
    response = client.post("/api/kiosk/face", json={"station_pin": {"secret": sentinel}, "image": "invalid"})
    assert response.status_code == 422
    assert sentinel not in response.text


def test_login_logs_do_not_contain_user_input(client):
    records = []
    class Capture(logging.Handler):
        def emit(self, record):
            records.append(record.getMessage())
    handler = Capture()
    security_logger.addHandler(handler)
    try:
        assert client.post("/api/auth/login", json={"email": "PRIVATE_IDENTIFIER", "password": "PRIVATE_PASSWORD"}).status_code == 401
    finally:
        security_logger.removeHandler(handler)
    assert any("LOGIN_FAILED" in msg for msg in records)
    assert all("PRIVATE_" not in msg for msg in records)


@pytest.mark.parametrize("environment", ["production", "development"])
def test_recovery_cannot_enumerate_accounts_or_return_codes(client, db_session, monkeypatch, environment):
    user = member(db_session)
    monkeypatch.setattr(auth, "ENVIRONMENT", environment)
    bodies = [client.post("/api/auth/password-reset/request", json={"identifier": identifier}).json()
              for identifier in (user.email, user.member_id, "unknown@example.test")]
    assert bodies[0] == bodies[1] == bodies[2]
    assert not bodies[0].get("debug_code")
    assert not bodies[0].get("delivery_channel")
    assert bodies[0]["requires_librarian_help"]


def test_unhandled_errors_and_probe_urls_are_private():
    app = FastAPI()
    app.add_middleware(SecurityMiddleware)
    @app.get("/failure")
    def fail():
        raise RuntimeError("PRIVATE_DATABASE_PASSWORD")
    records = []
    from middleware.security import logger
    class Capture(logging.Handler):
        def emit(self, record):
            records.append(record.getMessage())
    handler = Capture()
    logger.addHandler(handler)
    security_logger.addHandler(handler)
    try:
        client = TestClient(app)
        response = client.get("/failure?token=PRIVATE_QUERY_SECRET")
        client.get("/.env?password=PRIVATE_QUERY_SECRET")
    finally:
        logger.removeHandler(handler)
        security_logger.removeHandler(handler)
    assert response.status_code == 500
    assert response.headers["cache-control"] == "no-store"
    assert "PRIVATE_" not in response.text
    assert all("PRIVATE_" not in msg for msg in records)
    assert any("RuntimeError" in msg for msg in records)


def test_suspended_face_match_does_not_disclose_identity_or_issue_token(client, db_session, monkeypatch):
    from services import face_engine_service, liveness_service
    user = member(db_session, status="suspended")
    monkeypatch.setattr(liveness_service, "check_liveness", lambda image: ("ok", 1.0))
    monkeypatch.setattr(face_engine_service, "detect_faces", lambda *a, **kw: [{"encoding": [0.1]}])
    monkeypatch.setattr(face_engine_service, "find_match_for_face", lambda *a, **kw: SimpleNamespace(user=user))
    response = client.post("/api/auth/face", json={"image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD"})
    assert response.status_code == 200
    assert response.json()["matched"] is False
    assert not response.json().get("token")
    assert user.name not in response.text
    assert not response.headers.get("set-cookie")
    assert not db_session.query(EntryLog).filter_by(user_id=user.id, granted=True).count()


def test_face_runtime_errors_do_not_expose_paths(client, monkeypatch):
    from services import face_engine_service, liveness_service
    monkeypatch.setattr(liveness_service, "check_liveness", lambda image: ("ok", 1.0))
    def fail(*a, **kw):
        raise RuntimeError("PRIVATE_INTERNAL_PATH")
    monkeypatch.setattr(face_engine_service, "detect_faces", fail)
    response = client.post("/api/auth/face", json={"image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD"})
    assert response.status_code == 503
    assert "PRIVATE_" not in response.text


def test_local_identity_upload_is_not_public(client, db_session):
    user = member(db_session)
    Path("uploads/ids/private.png").write_bytes(b"private identity")
    assert client.get("/uploads/ids/private.png").status_code == 401
    client.post("/api/auth/login", json={"email": user.email, "password": "Password1"})
    assert client.get("/uploads/ids/private.png").status_code == 403
    Path("uploads/avatars/own.png").write_bytes(b"own avatar")
    user.avatar_url = "/uploads/avatars/own.png"
    db_session.commit()
    assert client.get("/uploads/avatars/own.png").content == b"own avatar"
    assert client.get("/uploads/avatars/other.png").status_code == 403


def test_public_local_covers_remain_accessible_without_login(client):
    Path("uploads/covers").mkdir(parents=True, exist_ok=True)
    Path("uploads/covers/public.png").write_bytes(b"public cover")
    response = client.get("/uploads/covers/public.png")
    assert response.status_code == 200
    assert response.content == b"public cover"


@pytest.mark.parametrize("environment,url", [
    ("production", "sqlite:///local.db"),
    ("development", "postgresql://user:password@cloud.example/db"),
])
def test_demo_seed_refuses_cloud_or_production_before_database_changes(monkeypatch, environment, url):
    import seed
    monkeypatch.setattr(seed, "ENVIRONMENT", environment)
    monkeypatch.setattr(seed, "DATABASE_URL", url)
    def unexpected():
        pytest.fail("Database initialization must not run")
    monkeypatch.setattr(seed, "init_db", unexpected)
    with pytest.raises(RuntimeError, match="local"):
        seed.seed()
