"""Supervised text fallback only; synthetic images/vectors, never real IDs."""
import base64
import hashlib
import io

from fastapi import HTTPException
from PIL import Image
import pytest

from models.user import User
from services import face_engine_service as engine
from services import identity_documents as ids
from services.face_enrollment_consent import FACE_CONSENT_VERSION
from services.passwords import hash_password
from timezone_utils import now_ph


def photo(color="white"):
    output = io.BytesIO()
    Image.new("RGB", (900, 600), color).save(output, "PNG")
    return output.getvalue()


def face(offset=0.0):
    return {"engine": "dlib", "encoding": [offset] * 128,
        "face_box": {"top": .1, "left": .1, "width": .4, "height": .5}}


def account(db, role="member", suffix="member"):
    user = User(name=f"Synthetic {suffix}", member_id=f"RPL-{suffix}",
        email=f"{suffix}@example.test", password_hash=hash_password("Password1"), role=role)
    db.add(user); db.commit(); db.refresh(user)
    return user


def sign_in(client, user):
    assert client.post("/api/auth/login", json={"email": user.email, "password": "Password1"}).status_code == 200


def mock_text_failure(monkeypatch):
    monkeypatch.setattr(ids, "read_id_text", lambda rgb: [])
    monkeypatch.setattr(ids, "document_face", lambda frame: face())


def inspect(client, content=None, **data):
    return client.post("/api/librarian/identity/inspect", data=data,
        files={"id_image": ("synthetic.png", content or photo(), "image/png")})


def manual_proof(client):
    result = inspect(client, manual_review="true", document_type="tin_id", current_password="Password1")
    assert result.status_code == 200
    return result.json()["review_token"]


def verified_member(db, kind="manual_tin_id"):
    from services.storage_service import save_upload
    member = account(db)
    content = photo()
    member.id_image_url = save_upload("ids", "synthetic.png", content)
    member.id_document_digest = hashlib.sha256(content).hexdigest()
    member.id_document_type = kind
    member.id_verified_at = now_ph(); member.id_verified_by_id = 99
    db.commit()
    return member, content


def enrollment(content):
    return {"image": "synthetic-live", "id_image": base64.b64encode(content).decode(),
        "accept_face_recognition": True, "face_consent_version": FACE_CONSENT_VERSION}


def mock_live(monkeypatch, hint="ok", live=None):
    from services import anti_spoof_service
    monkeypatch.setattr(engine, "detect_faces", lambda *a, **kw: [live or face()])
    monkeypatch.setattr(anti_spoof_service, "check_detected_faces_liveness", lambda *a, **kw: (hint, 1.0))
    monkeypatch.setattr(engine, "find_duplicate_for_enrollment", lambda *a, **kw: None)
    monkeypatch.setattr(ids, "comparison_face", lambda image, face, **kw: face)


def test_unreadable_text_offers_review_without_issuing_a_pass(client, db_session, monkeypatch):
    sign_in(client, account(db_session, "librarian", "staff")); mock_text_failure(monkeypatch)
    result = inspect(client)
    assert result.status_code == 422
    assert result.json()["manual_review_allowed"] is True
    assert "review_token" not in result.json()
    assert result.headers["cache-control"] == "no-store"
    result = inspect(client, manual_review="true", document_type="tin_id", current_password="Password1")
    assert result.status_code == 200
    body = result.json()
    assert body["review_method"] == "librarian_manual" and body["document_type"] == "manual_tin_id"
    assert body["suggested_name"] is None and body["suggested_location"] is None
    assert "Password1" not in result.text


@pytest.mark.parametrize("role,status,code", [(None, None, 401), ("member", "active", 403),
    ("librarian", "suspended", 401), ("librarian", "temporary", 403)])
def test_manual_check_is_not_anonymous_member_or_restricted_access(client, db_session, role, status, code):
    if role:
        user = account(db_session, role, "actor"); sign_in(client, user)
        if status == "temporary": user.must_change_password = True
        else: user.status = status
        db_session.commit()
    assert inspect(client, manual_review="true", document_type="tin_id", current_password="Password1").status_code == code


@pytest.mark.parametrize("fields,code", [
    ({}, 403), ({"current_password": "Wrong1", "document_type": "tin_id"}, 403),
    ({"current_password": "Password1"}, 422),
    ({"current_password": "Password1", "document_type": "poster"}, 422),
])
def test_manual_review_needs_password_and_supported_type(client, db_session, monkeypatch, fields, code):
    sign_in(client, account(db_session, "librarian", "staff")); mock_text_failure(monkeypatch)
    assert inspect(client, manual_review="true", **fields).status_code == code


@pytest.mark.parametrize("lines", [["SPECIMEN - NOT VALID"], ["FAKE ID"], ["SAMPLE ONLY"],
    ["EXPIRY: 2020-01-01"], ["BIR FORM NO. 2303"], ["OFFICIAL RECEIPT"],
    ["CERTIFICATE OF REGISTRATION"], ["BUREAU OF INTERNAL REVENUE", "TAX RETURN"]])
def test_manual_review_cannot_override_detected_invalid_expired_or_tax_document(client, db_session, monkeypatch, lines):
    sign_in(client, account(db_session, "librarian", "staff")); mock_text_failure(monkeypatch)
    monkeypatch.setattr(ids, "read_id_text", lambda rgb: lines)
    for fields in ({}, {"manual_review": "true", "document_type": "tin_id", "current_password": "Password1"}):
        result = inspect(client, **fields)
        assert result.status_code == 422
        assert not result.json().get("manual_review_allowed") and "review_token" not in result.json()


@pytest.mark.parametrize("faces,code", [([], 422), ([face(), face()], 422), (None, 503)])
def test_manual_review_still_requires_one_usable_portrait(client, db_session, monkeypatch, faces, code):
    sign_in(client, account(db_session, "librarian", "staff"))
    monkeypatch.setattr(ids, "read_id_text", lambda rgb: [])
    def detect(*args, **kwargs):
        if faces is None: raise RuntimeError("synthetic unavailable")
        return faces
    monkeypatch.setattr(engine, "detect_faces", detect)
    result = inspect(client, manual_review="true", document_type="tin_id", current_password="Password1")
    assert result.status_code == code
    assert "review_token" not in result.json() and not result.json().get("manual_review_allowed")


def test_text_service_outage_is_not_an_automatic_pass(client, db_session, monkeypatch):
    sign_in(client, account(db_session, "librarian", "staff")); mock_text_failure(monkeypatch)
    def unavailable(rgb): raise ids.DocumentReadabilityError(503, "ID text checking is temporarily unavailable.")
    monkeypatch.setattr(ids, "read_id_text", unavailable)
    assert inspect(client).status_code == 503
    assert inspect(client, manual_review="true", document_type="tin_id", current_password="Password1").status_code == 200


def test_manual_verification_is_attested_bound_and_records_provenance(client, db_session, monkeypatch):
    staff = account(db_session, "librarian", "staff"); member = account(db_session)
    sign_in(client, staff); mock_text_failure(monkeypatch)
    token = manual_proof(client)
    fields = {"id_review_token": token, "identity_checked": "true", "current_password": "Password1"}
    path = f"/api/librarian/users/{member.id}/verify-identity"
    for extra, image, code in (({"identity_checked": "false"}, photo(), 422),
        ({"current_password": "Wrong1"}, photo(), 403), ({}, photo("blue"), 422)):
        assert client.post(path, data={**fields, **extra}, files={"id_image": ("synthetic.png", image, "image/png")}).status_code == code
    other = account(db_session, "librarian", "other"); sign_in(client, other)
    assert client.post(path, data=fields, files={"id_image": ("synthetic.png", photo(), "image/png")}).status_code == 422
    sign_in(client, staff)
    assert client.post(path, data=fields, files={"id_image": ("synthetic.png", photo(), "image/png")}).status_code == 200
    db_session.refresh(member)
    assert member.id_document_type == "manual_tin_id" and member.id_verified_by_id == staff.id
    assert ids.has_verified_identity(member) and member.name == "Synthetic member"
    assert member.face_encoding is None


def test_required_id_registration_accepts_attested_manual_proof(client, db_session, monkeypatch):
    sign_in(client, account(db_session, "librarian", "staff")); mock_text_failure(monkeypatch)
    fields = {"name": "Synthetic Applicant", "location": "Test Town", "id_review_token": manual_proof(client)}
    files = {"id_image": ("synthetic.png", photo(), "image/png")}
    assert client.post("/api/librarian/users/register", data=fields, files=files).status_code == 422
    result = client.post("/api/librarian/users/register", data={**fields, "identity_checked": "true"}, files=files)
    assert result.status_code == 201
    member = db_session.get(User, result.json()["id"])
    assert member.id_document_type == "manual_tin_id" and member.must_change_password
    assert not member.email_verified and member.face_encoding is None


def test_manual_baseline_remote_enrollment_keeps_all_face_checks_and_no_comparison_files(client, db_session, monkeypatch):
    from pathlib import Path
    member, content = verified_member(db_session); sign_in(client, member)
    mock_text_failure(monkeypatch); mock_live(monkeypatch)
    before = {str(p) for p in Path("uploads").rglob("*") if p.is_file()}
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == 200
    db_session.refresh(member)
    assert member.face_encoding and member.face_id_verified_at
    assert member.id_document_type == "manual_tin_id"
    assert {str(p) for p in Path("uploads").rglob("*") if p.is_file()} == before


@pytest.mark.parametrize("hint,code", [("too_dark", 422), ("spoof", 422), ("retry", 422), ("uncertain", 422), ("unavailable", 503)])
def test_manual_baseline_cannot_bypass_remote_pad(client, db_session, monkeypatch, hint, code):
    member, content = verified_member(db_session); sign_in(client, member)
    mock_text_failure(monkeypatch); mock_live(monkeypatch, hint)
    assert client.post("/api/auth/enroll-face", json=enrollment(content)).status_code == code
    db_session.refresh(member); assert member.face_encoding is None


@pytest.mark.parametrize("mismatch", ["live", "uploaded", "baseline", "deduplication", "invalid_text", "portrait"])
def test_manual_baseline_cannot_bypass_remote_identity_checks(client, db_session, monkeypatch, mismatch):
    member, content = verified_member(db_session); sign_in(client, member)
    mock_text_failure(monkeypatch); mock_live(monkeypatch, live=face(1) if mismatch == "live" else face())
    code = 422
    if mismatch == "uploaded":
        portraits = iter([face(1), face()])
        monkeypatch.setattr(ids, "document_face", lambda frame: next(portraits))
    elif mismatch == "baseline":
        member.id_document_digest = "0" * 64; db_session.commit(); code = 409
    elif mismatch == "deduplication":
        monkeypatch.setattr(engine, "find_duplicate_for_enrollment", lambda *a, **kw: 99); code = 409
    elif mismatch == "invalid_text":
        monkeypatch.setattr(ids, "read_id_text", lambda rgb: ["SAMPLE ONLY"])
    elif mismatch == "portrait":
        def no_portrait(frame): raise HTTPException(422, "A usable ID portrait is required.")
        monkeypatch.setattr(ids, "document_face", no_portrait)
    assert client.post("/api/auth/enroll-face", json=enrollment(content)).status_code == code
    db_session.refresh(member); assert member.face_encoding is None


def test_member_request_cannot_authorize_manual_review(client, db_session, monkeypatch):
    member, content = verified_member(db_session, "national_id"); sign_in(client, member)
    mock_text_failure(monkeypatch); mock_live(monkeypatch)
    body = {**enrollment(content), "manual_review": True, "document_type": "manual_tin_id"}
    assert client.post("/api/auth/enroll-face", json=body).status_code == 422
    db_session.refresh(member); assert member.face_encoding is None
