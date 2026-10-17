import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite+pysqlite://"
os.environ["JWT_SECRET_KEY"] = "synthetic-test-signing-key-not-for-production"
os.environ["LIBRARIAN_AUTH_CODE"] = "test-librarian-code"
os.environ["ENVIRONMENT"] = "test"
os.environ["ALLOWED_ORIGINS"] = "http://testserver"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["AUTO_MIGRATE"] = "false"
os.environ["RATE_LIMIT_STORAGE_URI"] = ""
os.environ["RATE_LIMIT_REQUIRE_SHARED"] = "false"

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import database  # noqa: E402
from database import Base  # noqa: E402

engine = create_engine(
    "sqlite+pysqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
database.engine = engine
database.SessionLocal = TestingSessionLocal

from models import (  # noqa: E402,F401
    book,
    book_copy,
    entry_log,
    face_embedding,
    library_settings,
    notification,
    password_reset,
    reading_goal,
    reservation,
    security_alert,
    transaction,
    user,
)
from main import app  # noqa: E402
from limiter import limiter  # noqa: E402

limiter.enabled = False


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def reset_db(monkeypatch, tmp_path):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[database.get_db] = override_get_db
    monkeypatch.chdir(tmp_path)
    (tmp_path / "uploads" / "ids").mkdir(parents=True, exist_ok=True)
    (tmp_path / "uploads" / "avatars").mkdir(parents=True, exist_ok=True)
    yield
    app.dependency_overrides.clear()


@pytest.fixture()
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client():
    return TestClient(app)
