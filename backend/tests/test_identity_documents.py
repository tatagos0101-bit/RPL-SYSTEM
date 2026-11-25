"""Synthetic documents/vectors only; these tests do not measure camera accuracy."""
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json

from fastapi import HTTPException
import jwt
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import pytest

from config import JWT_ALGORITHM, JWT_SECRET_KEY
from models.security_alert import SecurityAlert
from models.user import User
from services import face_engine_service as engine
from services import identity_documents as ids
from services.face_enrollment_consent import FACE_CONSENT_VERSION
from services.passwords import hash_password
from timezone_utils import now_ph


def photo(color="white"):
    buffer = io.BytesIO()
    Image.new("RGB", (900, 600), color).save(buffer, format="PNG")
    return buffer.getvalue()


def face(offset=0.0):
    return {"engine": "dlib", "encoding": [offset] * 128,
            "face_box": {"top": .1, "left": .1, "width": .4, "height": .5}}


def account(db, role="member", suffix="one"):
    user = User(name=f"Synthetic {suffix}", member_id=f"RPL-{suffix}",
        email=f"{suffix}@example.test", password_hash=hash_password("Password1"), role=role)
    db.add(user); db.commit(); db.refresh(user)
    return user


def sign_in(client, user):
    result = client.post("/api/auth/login", json={"email": user.email, "password": "Password1"})
    assert result.status_code == 200


def setup_verified(db, member):
    content = photo()
    from services.storage_service import save_upload
    member.id_image_url = save_upload("ids", "synthetic.png", content)
    member.id_document_digest = hashlib.sha256(content).hexdigest()
    member.id_document_type = "national_id"
    member.id_verified_at = now_ph()
    member.id_verified_by_id = 99
    db.commit()
    return content


def mock_document(monkeypatch):
    monkeypatch.setattr(ids, "read_id_text", lambda rgb: ["REPUBLIC OF THE PHILIPPINES",
        "PHILIPPINE IDENTIFICATION CARD", "FULL NAME: SYNTHETIC TEST PERSON", "ADDRESS: TEST TOWN RIZAL"])
    monkeypatch.setattr(ids, "document_face", lambda image: face())


def enrollment(content):
    return {"image": "synthetic-live-camera", "id_image": base64.b64encode(content).decode(),
        "accept_face_recognition": True, "face_consent_version": FACE_CONSENT_VERSION}


def mock_live(monkeypatch, hint="ok", live=None):
    from services import anti_spoof_service
    monkeypatch.setattr(engine, "detect_faces", lambda *a, **kw: [live or face()])
    monkeypatch.setattr(anti_spoof_service, "check_detected_faces_liveness", lambda *a, **kw: (hint, 1.0))
    monkeypatch.setattr(engine, "find_duplicate_for_enrollment", lambda *a, **kw: None)
    monkeypatch.setattr(ids, "comparison_face", lambda image, face, **kw: face)


def test_document_rejects_garbage_and_tiny_images():
    for content in (b"not a photo", b"%PDF-1.7 synthetic"):
        with pytest.raises(HTTPException) as failure:
            ids.document_image(content)
        assert failure.value.status_code == 422
    stream = io.BytesIO(); Image.new("RGB", (120, 80)).save(stream, "PNG")
    with pytest.raises(HTTPException): ids.document_image(stream.getvalue())


def test_non_id_text_is_rejected_and_fields_are_suggestions():
    with pytest.raises(HTTPException): ids.classify_document(["A portrait", "A library poster", "Welcome to our library"])
    with pytest.raises(HTTPException): ids.classify_document(["FULL NAME: SYNTHETIC PERSON", "ADDRESS: TEST TOWN", "FAVOURITE BOOK: A VERY LONG TITLE"])
    lines = ["REPUBLIC OF THE PHILIPPINES", "PHILIPPINE IDENTIFICATION CARD", "FULL NAME: SYNTHETIC TEST PERSON", "ADDRESS: TEST TOWN RIZAL"]
    assert ids.classify_document(lines) == "national_id"
    assert ids.suggested_fields(lines) == ("SYNTHETIC TEST PERSON", "TEST TOWN RIZAL")
    assert ids.suggested_fields(["SURNAME", "TESTER", "GIVEN NAMES", "SYNTHETIC", "MIDDLE NAME", "EXAMPLE"]) == ("SYNTHETIC EXAMPLE TESTER", None)
    with pytest.raises(HTTPException): ids.classify_document([*lines, "SPECIMEN - NOT VALID"])
    with pytest.raises(HTTPException): ids.classify_document([*lines, "EXPIRY: 2020-01-01"])


def test_review_token_binds_staff_document_version_and_expiry():
    content = photo()
    check = ids.DocumentCheck(hashlib.sha256(content).hexdigest(), "national_id", None, None, face())
    token = ids.issue_review_token(check, 12)
    assert ids.verify_review_token(token, content, 12)["kind"] == "national_id"
    for raw, actor in ((photo("blue"), 12), (content, 13)):
        with pytest.raises(HTTPException): ids.verify_review_token(token, raw, actor)
    claims = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    for replacement in ({"exp": datetime.now(timezone.utc) - timedelta(seconds=1)}, {"version": "old"}, {"scope": "upload"}):
        bad = jwt.encode({**claims, **replacement}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
        with pytest.raises(HTTPException): ids.verify_review_token(bad, content, 12)


def test_registration_requires_original_id_check_and_librarian(client, db_session, monkeypatch):
    mock_document(monkeypatch)
    staff = account(db_session, "librarian", "staff")
    sign_in(client, staff)
    original_count = db_session.query(User).count()
    for fields in ({}, {"identity_checked": "true"}):
        result = client.post("/api/librarian/users/register", data={"name": "Synthetic Member", "location": "Test Town", **fields})
        assert result.status_code == 422
    content = photo()
    checked = client.post("/api/librarian/identity/inspect", files={"id_image": ("id.png", content, "image/png")})
    assert checked.status_code == 200
    assert checked.headers["cache-control"] == "no-store"
    assert "ID NO" not in checked.text
    fields = {"name": "Synthetic Member", "location": "Test Town", "identity_checked": "true", "id_review_token": checked.json()["review_token"]}
    wrong = client.post("/api/librarian/users/register", data=fields, files={"id_image": ("id.png", photo("blue"), "image/png")})
    assert wrong.status_code == 422
    assert db_session.query(User).count() == original_count
    saved = client.post("/api/librarian/users/register", data=fields, files={"id_image": ("id.png", content, "image/png")})
    assert saved.status_code == 201
    member = db_session.get(User, saved.json()["id"])
    assert ids.has_verified_identity(member)
    assert member.id_verified_by_id == staff.id
    assert member.name == "Synthetic Member"  # OCR never overwrites reviewed fields.
    assert member.face_encoding is None and not member.email_verified
    sign_in(client, account(db_session, suffix="ordinary"))
    assert client.post("/api/librarian/identity/inspect", files={"id_image": ("id.png", content, "image/png")}).status_code == 403
    client.cookies.clear()
    assert client.post("/api/librarian/identity/inspect", files={"id_image": ("id.png", content, "image/png")}).status_code == 401


def test_legacy_upload_or_display_badge_is_not_verified_identity(client, db_session):
    member = account(db_session)
    member.id_image_url = "/uploads/ids/legacy.png"; member.face_enrollment_display_only = True
    db_session.commit(); sign_in(client, member)
    profile = client.get("/api/user/profile").json()
    assert not profile["identity_verified"] and not profile["remote_face_enrollment_allowed"]
    assert client.post("/api/auth/enroll-face", json=enrollment(photo())).status_code == 403


def test_required_id_and_current_consent(client, db_session):
    member = account(db_session); setup_verified(db_session, member); sign_in(client, member)
    body = enrollment(photo()); body.pop("id_image")
    assert client.post("/api/auth/enroll-face", json=body).status_code == 422
    body = enrollment(photo()); body["accept_face_recognition"] = False
    assert client.post("/api/auth/enroll-face", json=body).status_code == 422
    body["accept_face_recognition"] = True; body["face_consent_version"] = "2026-11-24"
    assert client.post("/api/auth/enroll-face", json=body).status_code == 422


@pytest.mark.parametrize("hint,code", [("too_dark", 422), ("spoof", 422), ("retry", 422), ("uncertain", 422), ("unavailable", 503)])
def test_remote_pad_fails_closed_without_retaining_images(client, db_session, monkeypatch, hint, code):
    member = account(db_session); content = setup_verified(db_session, member); sign_in(client, member)
    mock_live(monkeypatch, hint)
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == code
    db_session.refresh(member)
    assert member.face_encoding is None and member.face_id_verified_at is None
    assert db_session.query(SecurityAlert).count() == 0
    assert "synthetic-live-camera" not in result.text


@pytest.mark.parametrize("mismatch", ["live", "uploaded", "baseline_changed"])
def test_id_and_live_face_must_match_saved_identity(client, db_session, monkeypatch, mismatch):
    member = account(db_session); content = setup_verified(db_session, member); sign_in(client, member)
    mock_document(monkeypatch); mock_live(monkeypatch, live=face(1) if mismatch == "live" else face())
    if mismatch == "uploaded":
        monkeypatch.setattr(ids, "inspect_document", lambda raw: ids.DocumentCheck(hashlib.sha256(raw).hexdigest(), "national_id", None, None, face(1)))
    if mismatch == "baseline_changed":
        from pathlib import Path
        Path("uploads/ids/synthetic.png").write_bytes(photo("blue"))
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == (409 if mismatch == "baseline_changed" else 422)
    db_session.refresh(member); assert member.face_encoding is None


def test_successful_remote_enrollment_keeps_template_not_comparison_files(client, db_session, monkeypatch):
    from pathlib import Path
    member = account(db_session); content = setup_verified(db_session, member); sign_in(client, member)
    mock_document(monkeypatch); mock_live(monkeypatch)
    before = {str(p) for p in Path("uploads").rglob("*") if p.is_file()}
    body = enrollment(content); body["user_id"] = 999; body["name"] = "Do not replace identity"
    result = client.post("/api/auth/enroll-face", json=body)
    assert result.status_code == 200
    db_session.refresh(member)
    assert json.loads(member.face_encoding) == [0.0] * 128
    assert member.name == "Synthetic one" and member.face_id_verified_at
    assert member.face_consent_method == "self_id_checked"
    assert member.id_document_digest == hashlib.sha256(content).hexdigest()
    assert {str(p) for p in Path("uploads").rglob("*") if p.is_file()} == before
    assert db_session.query(SecurityAlert).count() == 0


@pytest.mark.parametrize("matches", [False, True])
def test_remote_sface_comparison_still_enforces_matches_and_keeps_original_template(client, db_session, monkeypatch, matches):
    member = account(db_session); content = setup_verified(db_session, member); sign_in(client, member)
    mock_document(monkeypatch); mock_live(monkeypatch)
    calls = []
    def compare(frame, detected, **kwargs):
        assert kwargs["engine_name"] == "sface"
        calls.append(kwargs["label"])
        values = [0.0] * 128
        values[1 if kwargs["label"] == "live camera" and not matches else 0] = 1.0
        return {"engine": "sface", "encoding": values}
    monkeypatch.setattr(ids, "comparison_face", compare)
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == (200 if matches else 422)
    if not matches:
        assert result.headers["cache-control"] == "no-store"
        report = result.json()["comparison_diagnostic"]
        assert report["stage"] == "live_to_saved" and report["distances"]["id_to_saved"] == 0
        assert report["distances"]["live_to_saved"] == 1 and report["distances"]["live_to_id"] == 1
        for private in ("synthetic-live-camera", member.name, member.id_image_url, member.id_document_digest):
            assert private not in result.text
    assert calls == ["uploaded ID", "saved library ID", "live camera"]
    db_session.refresh(member)
    assert member.face_encoding == (json.dumps([0.0] * 128) if matches else None)
    assert bool(member.face_id_verified_at) == matches


def test_live_pad_failure_cannot_reach_the_new_comparator(client, db_session, monkeypatch):
    member = account(db_session); content = setup_verified(db_session, member); sign_in(client, member)
    mock_document(monkeypatch); mock_live(monkeypatch, "spoof")
    def forbidden(*args, **kwargs): pytest.fail("A failed live check cannot run identity comparison")
    monkeypatch.setattr(ids, "comparison_face", forbidden)
    assert client.post("/api/auth/enroll-face", json=enrollment(content)).status_code == 422


@pytest.mark.parametrize("reason", ["not_found", "multiple_faces", "different_face", "invalid_landmarks"])
def test_live_alignment_failure_has_safe_support_details_after_id_and_pad_checks(client, db_session, monkeypatch, reason):
    from services.id_face_verifier import PortraitDetectionError
    member = account(db_session); content = setup_verified(db_session, member); sign_in(client, member)
    mock_document(monkeypatch); mock_live(monkeypatch)
    def compare(frame, detected, **kwargs):
        if kwargs["label"] == "live camera":
            raise PortraitDetectionError(reason, "The live camera portrait needs one clear face for comparison.")
        return {"engine": "sface", "encoding": [1.0] + [0.0] * 127}
    monkeypatch.setattr(ids, "comparison_face", compare)
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == 422 and result.headers["cache-control"] == "no-store"
    report = result.json()["comparison_diagnostic"]
    assert report["stage"] == "live_alignment" and report["detector_issue"] == reason
    assert report["distances"] == {"id_to_saved": 0.0}
    assert "live" in report["quality"]
    for private in ("synthetic-live-camera", member.name, member.id_image_url, member.id_document_digest):
        assert private not in result.text
    db_session.refresh(member)
    assert member.face_encoding is None and member.face_id_verified_at is None
    assert member.face_consent_method is None
    assert db_session.query(SecurityAlert).count() == 0


def test_support_diagnostics_require_a_matching_original_id(client, db_session, monkeypatch):
    member = account(db_session); content = setup_verified(db_session, member); sign_in(client, member)
    mock_document(monkeypatch); mock_live(monkeypatch)
    def compare(frame, detected, **kwargs):
        assert kwargs["label"] != "live camera"
        values = [0.0] * 128
        values[1 if kwargs["label"] == "uploaded ID" else 0] = 1.0
        return {"engine": "sface", "encoding": values}
    monkeypatch.setattr(ids, "comparison_face", compare)
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == 422 and "comparison_diagnostic" not in result.json()


def test_private_id_reader_rejects_arbitrary_paths_and_categories():
    from services.storage_service import read_private_upload
    for path in ("https://example.test/id.png", "/uploads/ids/../secret", "/uploads/avatars/photo.png", "supabase://other-bucket/id.png"):
        with pytest.raises(HTTPException): read_private_upload(path, folder="ids", max_bytes=1000)


def test_existing_member_verification_requires_staff_password_and_presence(client, db_session, monkeypatch):
    staff = account(db_session, "librarian", "staff"); member = account(db_session)
    sign_in(client, staff); mock_document(monkeypatch); content = photo()
    result = client.post("/api/librarian/identity/inspect", files={"id_image": ("id.png", content, "image/png")})
    fields = {"id_review_token": result.json()["review_token"], "identity_checked": "true", "current_password": "Wrong1"}
    path = f"/api/librarian/users/{member.id}/verify-identity"
    assert client.post(path, data=fields, files={"id_image": ("id.png", content, "image/png")}).status_code == 403

    fields["current_password"] = "Password1"; fields["identity_checked"] = "false"
    assert client.post(path, data=fields, files={"id_image": ("id.png", content, "image/png")}).status_code == 422
    fields["identity_checked"] = "true"
    assert client.post(path, data=fields, files={"id_image": ("id.png", content, "image/png")}).status_code == 200
    sign_in(client, member)
    assert client.get("/api/user/profile").json()["remote_face_enrollment_allowed"]
    assert client.post(path, data=fields, files={"id_image": ("id.png", content, "image/png")}).status_code == 403


def test_same_checked_upload_cannot_create_two_accounts(client, db_session, checked_photo_id):
    staff = account(db_session, "librarian", "staff"); sign_in(client, staff)
    fields, files = checked_photo_id(client)
    body = {"name": "Synthetic Member", "location": "Test Town", **fields}
    assert client.post("/api/librarian/users/register", data=body, files=files).status_code == 201
    assert client.post("/api/librarian/users/register", data=body, files=files).status_code == 409
    assert db_session.query(User).count() == 2


def test_failed_ocr_asset_check_is_unavailable_not_a_document_pass(monkeypatch):
    monkeypatch.setattr(ids, "_ocr", None)
    monkeypatch.setattr(ids, "_MODEL_HASHES", {"missing-synthetic-model.onnx": "0" * 64})
    with pytest.raises(HTTPException) as failure:
        ids.read_id_text(np.zeros((600, 900, 3), dtype="uint8"))
    assert failure.value.status_code == 503
    assert "missing-synthetic" not in failure.value.detail


def test_bundled_ocr_reads_synthetic_text_and_rejects_its_invalid_marking(monkeypatch):
    image = Image.new("RGB", (1300, 760), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=32)
    for index, value in enumerate(["SYNTHETIC DOCUMENT - NOT VALID", "REPUBLIC OF THE PHILIPPINES",
        "PHILIPPINE IDENTIFICATION CARD", "FULL NAME: SYNTHETIC TEST PERSON", "ADDRESS: TEST TOWN RIZAL"]):
        draw.text((30, 30 + 90 * index), value, font=font, fill="black")
    def no_network(*args):
        pytest.fail("ID text reading must not use a network service")
    monkeypatch.setattr("socket.socket.connect", no_network)
    lines = ids.read_id_text(np.array(image))
    assert ids.suggested_fields(lines) == ("SYNTHETIC TEST PERSON", "TEST TOWN RIZAL")
    with pytest.raises(HTTPException) as failure:
        ids.classify_document(lines)
    assert failure.value.status_code == 422


def test_identity_upgrade_is_additive_repeatable_and_does_not_verify_legacy_ids():
    from sqlalchemy import create_engine, inspect, text
    from database import Base
    from services.schema_migrations import upgrade_schema
    engine = create_engine("sqlite+pysqlite://")
    Base.metadata.create_all(engine)
    columns = ["id_document_digest", "id_document_type", "id_verified_at", "id_verified_by_id", "face_id_verified_at"]
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id, name, password_hash, role, status, id_image_url, must_change_password, email_verified, phone_verified) VALUES (1, 'Synthetic Legacy', 'unused', 'member', 'active', '/uploads/ids/synthetic-legacy.png', false, false, false)"))
        conn.execute(text("DROP INDEX uq_users_id_document_digest"))
        for column in columns:
            conn.execute(text(f"ALTER TABLE users DROP COLUMN {column}"))
        upgrade_schema(conn, Base.metadata)
        upgrade_schema(conn, Base.metadata)
        assert set(columns) <= {column["name"] for column in inspect(conn).get_columns("users")}
        assert conn.execute(text("SELECT name, id_image_url FROM users WHERE id = 1")).one() == ("Synthetic Legacy", "/uploads/ids/synthetic-legacy.png")
        assert conn.execute(text("SELECT " + ", ".join(columns) + " FROM users WHERE id = 1")).one() == (None,) * 5
        assert next(index for index in inspect(conn).get_indexes("users") if index["name"] == "uq_users_id_document_digest")["unique"]
    engine.dispose()
