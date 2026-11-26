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
    # Tests must never inherit live message delivery from a local environment.
    monkeypatch.setenv("OTP_SMTP_HOST", "")
    monkeypatch.setenv("REGISTRATION_SMS_PROVIDER", "")
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


@pytest.fixture()
def checked_photo_id(monkeypatch):
    """Real image/token validation with synthetic OCR/portrait results."""
    import io
    from PIL import Image
    from services import identity_documents as identity
    monkeypatch.setattr(identity, "read_id_text", lambda rgb: [
        "REPUBLIC OF THE PHILIPPINES", "PHILIPPINE IDENTIFICATION CARD",
        "FULL NAME: SYNTHETIC MEMBER", "ADDRESS: SYNTHETIC TEST LOCATION"])
    monkeypatch.setattr(identity, "document_face", lambda frame: {
        "engine": "dlib", "encoding": [0.0] * 128})
    sequence = 0

    def prepare(client):
        nonlocal sequence
        sequence += 1
        output = io.BytesIO()
        Image.new("RGB", (900, 600), (sequence % 255, 230, 220)).save(output, "PNG")
        files = {"id_image": ("synthetic.png", output.getvalue(), "image/png")}
        result = client.post("/api/librarian/identity/inspect", files=files)
        assert result.status_code == 200, result.text
        from schemas.library_workflows import TERMS_VERSION
        return {"identity_checked": "true", "id_review_token": result.json()["review_token"],
            "member_agreed_terms": "true", "terms_version": TERMS_VERSION}, files
    return prepare


@pytest.fixture()
def remote_identity_ready(monkeypatch):
    """Isolate existing PAD/engine tests; identity comparison has its own suite."""
    from services import identity_documents as identity
    from timezone_utils import now_ph
    monkeypatch.setattr(identity, "verify_remote_identity", lambda *args: None)

    def prepare(member, db):
        member.id_image_url = "/uploads/ids/synthetic.png"
        member.id_document_digest = f"{member.id:064x}"
        member.id_verified_at = now_ph()
        member.id_verified_by_id = 99
        db.commit()
        return {"id_image": "synthetic-id"}
    return prepare
