from io import BytesIO

import httpx
import pytest
from passlib.context import CryptContext
from sqlalchemy import Boolean, Column, DateTime, create_engine, inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateColumn, CreateTable
from sqlalchemy.pool import NullPool

import config
import database
from database import Base
from models.user import User
from services.database_config import engine_settings
from services import storage_service as storage
from services import cloud_uploads

PNG = b"\x89PNG\r\n\x1a\n" + b"cloud-test"


def test_postgres_utc_timestamps_keep_the_philippine_calendar_date():
    from datetime import datetime, timezone
    from timezone_utils import as_ph
    assert as_ph(datetime(2025, 12, 31, 17, tzinfo=timezone.utc)).date().isoformat() == "2026-01-01"
    assert as_ph(datetime(2026, 1, 1, 1)).hour == 1


def test_supabase_pooler_uses_tls_without_session_pool_or_prepared_statements():
    url, options = engine_settings("postgres://postgres.project:p%40ss@aws-0-region.pooler.supabase.com:6543/postgres?supa=base-pooler.x", production=True)
    assert url.drivername == "postgresql+psycopg"
    assert url.password == "p@ss"
    assert "supa" not in url.query
    assert options["poolclass"] is NullPool
    assert options["connect_args"]["prepare_threshold"] is None
    assert options["connect_args"]["sslmode"] == "require"
    with pytest.raises(ValueError, match="SSL"):
        engine_settings("postgresql://user:password@host/db?sslmode=disable", production=True)


def test_postgres_schema_and_additive_column_types_compile():
    dialect = postgresql.dialect()
    for table in Base.metadata.sorted_tables:
        sql = str(CreateTable(table).compile(dialect=dialect))
        assert "CREATE TABLE" in sql
    assert "TIMESTAMP WITH TIME ZONE" in str(CreateColumn(Column("time_out", DateTime(timezone=True))).compile(dialect=dialect))
    assert "BOOLEAN" in str(CreateColumn(Column("verified", Boolean)).compile(dialect=dialect))


def test_additive_migration_keeps_existing_rows_and_runs_twice(monkeypatch):
    legacy = create_engine("sqlite+pysqlite://")
    with legacy.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(120), email VARCHAR(180), password_hash VARCHAR(255), role VARCHAR(20), phone VARCHAR(30), location VARCHAR(120), status VARCHAR(20), face_encoding TEXT, created_at DATETIME, updated_at DATETIME)"))
        conn.execute(text("INSERT INTO users (id, name, password_hash, role, status) VALUES (1, 'Existing member', 'hash', 'member', 'active')"))
    monkeypatch.setattr(database, "engine", legacy)
    database.init_db()
    database.init_db()
    with legacy.connect() as conn:
        assert conn.execute(text("SELECT name, must_change_password FROM users WHERE id=1")).one() == ("Existing member", 0)
        assert conn.execute(text("SELECT deleted_at FROM users WHERE id=1")).scalar() is None
        assert "deleted_at" in {column["name"] for column in inspect(conn).get_columns("users")}
        assert "security_alerts" in inspect(conn).get_table_names()
    legacy.dispose()


@pytest.fixture()
def cloud_storage(monkeypatch):
    requests = []
    monkeypatch.setattr(storage, "STORAGE_BACKEND", "supabase")
    monkeypatch.setattr(storage, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(storage, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

    def handler(method, url, **kwargs):
        requests.append((method, url, kwargs))
        payload = {"signedURL": "/object/sign/rpl-avatars/avatar.png?token=temporary"} if "/sign/" in url else {"Key": "uploaded"}
        return httpx.Response(200, json=payload, request=httpx.Request(method, url))

    monkeypatch.setattr(storage.httpx, "request", handler)
    return requests


def test_cloud_uploads_never_write_to_local_disk(cloud_storage):
    from pathlib import Path
    cover = storage.save_upload("covers", "cover.png", PNG)
    avatar = storage.save_upload("avatars", "avatar.png", PNG)
    identity = storage.save_upload("ids", "identity.pdf", b"%PDF-test")
    assert cover == "https://project.supabase.co/storage/v1/object/public/rpl-covers/cover.png"
    assert avatar == "supabase://rpl-avatars/avatar.png"
    assert identity == "supabase://rpl-ids/identity.pdf"
    assert not list(Path("uploads").rglob("*.*"))
    assert cloud_storage[2][2]["headers"]["Content-Type"] == "application/pdf"


def test_private_asset_links_are_resolved_without_changing_the_stored_reference(cloud_storage):
    reference = "supabase://rpl-avatars/avatar.png"
    assert storage.resolve_upload_url(reference).startswith("https://project.supabase.co/storage/v1/object/sign/")
    assert cloud_storage[0][2]["json"]["expiresIn"] == config.STORAGE_SIGNED_URL_SECONDS


def test_storage_failure_is_reported_without_local_fallback(cloud_storage, monkeypatch):
    def unavailable(*args, **kwargs):
        raise httpx.ConnectError("offline")
    monkeypatch.setattr(storage.httpx, "request", unavailable)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:
        storage.save_upload("covers", "cover.png", PNG)
    assert error.value.status_code == 502


def test_avatar_endpoint_persists_private_reference_and_returns_viewable_url(client, db_session, cloud_storage):
    user = User(name="Cloud member", email="cloud@example.test", password_hash=CryptContext(schemes=["bcrypt"]).hash("Password1"), role="member")
    db_session.add(user)
    db_session.commit()
    client.post("/api/auth/login", json={"email": user.email, "password": "Password1"})
    response = client.post("/api/user/avatar", files={"file": ("avatar.png", BytesIO(PNG), "image/png")})
    assert response.status_code == 200
    db_session.refresh(user)
    assert user.avatar_url.startswith("supabase://rpl-avatars/")
    assert response.json()["avatar_url"].startswith("https://project.supabase.co/")
    assert client.get("/api/user/profile").json()["avatar_url"].startswith("https://project.supabase.co/")


def test_id_document_requires_librarian_access(client, db_session):
    user = User(name="Member", email="id@example.test", password_hash=CryptContext(schemes=["bcrypt"]).hash("Password1"), role="member")
    db_session.add(user)
    db_session.commit()
    assert client.get(f"/api/librarian/users/{user.id}/id-document").status_code == 401
    client.post("/api/auth/login", json={"email": user.email, "password": "Password1"})
    assert client.get(f"/api/librarian/users/{user.id}/id-document").status_code == 403


def test_production_refuses_local_persistence(monkeypatch):
    monkeypatch.setattr(config, "ENVIRONMENT", "production")
    monkeypatch.setattr(config, "STORAGE_BACKEND", "local")
    with pytest.raises(RuntimeError, match="PostgreSQL"):
        config.validate_deployment_config()
    monkeypatch.setattr(config, "DATABASE_URL", "postgresql://cloud/database")
    with pytest.raises(RuntimeError, match="local uploads"):
        config.validate_deployment_config()


def test_direct_upload_ticket_is_bound_to_owner_and_category(cloud_storage, monkeypatch):
    import asyncio
    from fastapi import HTTPException
    monkeypatch.setattr(cloud_uploads, "STORAGE_BACKEND", "supabase")
    prepared = cloud_uploads.prepare_upload("avatars", "avatar.png", len(PNG), 10)
    assert prepared["direct"] is True
    assert prepared["upload_url"].startswith("https://project.supabase.co/")
    for owner, category in [(11, "avatars"), (10, "ids")]:
        with pytest.raises(HTTPException) as error:
            asyncio.run(cloud_uploads.read_upload(folder=category, user_id=owner, file=None, ticket=prepared["upload_ticket"]))
        assert error.value.status_code == 403


def test_direct_avatar_uses_storage_content_validation(client, db_session, cloud_storage, monkeypatch):
    monkeypatch.setattr(cloud_uploads, "STORAGE_BACKEND", "supabase")
    monkeypatch.setattr(storage, "read_cloud_upload", lambda folder, name: PNG)
    user = User(name="Direct member", email="direct@example.test", password_hash=CryptContext(schemes=["bcrypt"]).hash("Password1"), role="member")
    db_session.add(user)
    db_session.commit()
    client.post("/api/auth/login", json={"email": user.email, "password": "Password1"})
    prepared = client.post("/api/uploads/prepare", json={"category": "avatars", "filename": "avatar.png", "size": len(PNG)})
    assert prepared.status_code == 200
    assert client.get("/api/user/profile", headers={"Authorization": f"Bearer {prepared.json()['upload_ticket']}"}).status_code == 401
    response = client.post("/api/user/avatar", data={"upload_ticket": prepared.json()["upload_ticket"]})
    assert response.status_code == 200
    db_session.refresh(user)
    assert user.avatar_url.startswith("supabase://rpl-avatars/")
    assert client.post("/api/uploads/prepare", json={"category": "ids", "filename": "id.png", "size": len(PNG)}).status_code == 403
    deleted = []
    monkeypatch.setattr('routers.users.delete_upload', lambda *args, **kwargs: deleted.append(args))
    retry = client.post("/api/user/avatar", data={"upload_ticket": prepared.json()["upload_ticket"]})
    assert retry.status_code == 200
    assert deleted == []


def test_direct_upload_still_rejects_spoofed_file_content(cloud_storage, monkeypatch):
    import asyncio
    from fastapi import HTTPException
    from services.upload_validation import validate_upload_bytes, IMAGE_EXTS
    monkeypatch.setattr(cloud_uploads, "STORAGE_BACKEND", "supabase")
    monkeypatch.setattr(storage, "read_cloud_upload", lambda *args: b"not-an-image")
    ticket = cloud_uploads.prepare_upload("avatars", "avatar.png", 12, 10)["upload_ticket"]
    content, filename, _ = asyncio.run(cloud_uploads.read_upload(folder="avatars", user_id=10, file=None, ticket=ticket))
    with pytest.raises(HTTPException):
        validate_upload_bytes(content=content, filename=filename, allowed_exts=IMAGE_EXTS, max_bytes=5 * 1024 * 1024, human_label="Avatar")
