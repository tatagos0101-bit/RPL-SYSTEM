"""Synthetic templates/documents only; never measure real-person accuracy here."""
from datetime import timedelta
import json

import pytest
from fastapi import HTTPException

from models.face_embedding import FaceEmbedding
from services import face_engine_service as engine
from services import identity_documents as ids
from services.face_enrollment_consent import FACE_CONSENT_VERSION
from tests.test_identity_documents import account, enrollment, face, mock_document, mock_live, setup_verified, sign_in
from timezone_utils import now_ph


def trusted_member(db):
    member = account(db)
    actor = account(db, "librarian", "reviewer")
    content = setup_verified(db, member)
    member.id_verified_by_id = actor.id
    member.id_verified_at = now_ph() - timedelta(minutes=2)
    member.face_encoding = json.dumps([.1] * 128)
    member.face_consent_version = FACE_CONSENT_VERSION
    member.face_consent_at = now_ph()
    member.face_consent_method = "librarian_assisted"
    member.face_consent_recorded_by_id = actor.id
    db.commit()
    return member, content


def mock_checked_id(monkeypatch):
    mock_document(monkeypatch)
    mock_live(monkeypatch, live=face(.11))
    def compare(frame, detected, **kwargs):
        assert kwargs["label"] != "live camera", "Registered-face verification must not run first-enrollment live/ID matching"
        return {"engine": "sface", "encoding": [1.0] + [0.0] * 127}
    monkeypatch.setattr(ids, "comparison_face", compare)


def test_existing_librarian_enrollment_is_verified_without_replacing_its_template(client, db_session, monkeypatch):
    member, content = trusted_member(db_session)
    sign_in(client, member); mock_checked_id(monkeypatch)
    before = (member.face_encoding, member.face_consent_at, member.face_consent_method, member.face_id_verified_at)
    def forbidden(*args, **kwargs): pytest.fail("Verification cannot replace the enrolled baseline")
    monkeypatch.setattr(engine, "store_enrollment_face", forbidden)
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == 200
    assert result.json()["operation"] == "verified_existing"
    assert result.json()["enrollment_changed"] is False
    db_session.refresh(member)
    assert (member.face_encoding, member.face_consent_at, member.face_consent_method, member.face_id_verified_at) == before
    assert db_session.query(FaceEmbedding).count() == 0
    profile = client.get("/api/user/profile").json()
    assert profile["remote_face_verification_method"] == "registered_face"
    assert profile["remote_face_capture_mirrored"] is True
    assert not any(key in profile for key in ("face_encoding", "embedding", "id_document_digest"))


def test_a_different_face_cannot_verify_someone_elses_registered_enrollment(client, db_session, monkeypatch):
    member, content = trusted_member(db_session)
    other = account(db_session, suffix="other")
    other.face_encoding = json.dumps([.3] * 128); db_session.commit()
    sign_in(client, member); mock_checked_id(monkeypatch)
    monkeypatch.setattr(engine, "detect_faces", lambda *a, **kw: [face(.3)])
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == 422
    assert "registered face" in result.json()["detail"]
    assert other.name not in result.text and other.email not in result.text
    db_session.refresh(member)
    assert member.face_encoding == json.dumps([.1] * 128)


def test_the_existing_login_margin_still_rejects_ambiguous_faces(client, db_session, monkeypatch):
    member, content = trusted_member(db_session)
    other = account(db_session, suffix="similar")
    other.face_encoding = json.dumps([.102] * 128); db_session.commit()
    sign_in(client, member); mock_checked_id(monkeypatch)
    monkeypatch.setattr(engine, "detect_faces", lambda *a, **kw: [face(.1)])
    assert client.post("/api/auth/enroll-face", json=enrollment(content)).status_code == 422


@pytest.mark.parametrize("change", ["self", "missing_consent", "old_notice", "self_actor", "before_id", "display_only", "removed_template"])
def test_untrusted_or_missing_references_cannot_enable_registered_face_verification(client, db_session, monkeypatch, change):
    member, content = trusted_member(db_session)
    if change == "self": member.face_consent_method = "self"
    elif change == "missing_consent": member.face_consent_at = None
    elif change == "old_notice": member.face_consent_version = "old"
    elif change == "self_actor": member.face_consent_recorded_by_id = member.id
    elif change == "before_id": member.face_consent_at = now_ph() - timedelta(days=1)
    elif change == "display_only": member.face_enrollment_display_only = True
    else: member.face_encoding = None
    db_session.commit(); sign_in(client, member); mock_checked_id(monkeypatch)
    assert not ids.can_verify_registered_face(db_session, member)
    assert client.get("/api/user/profile").json()["remote_face_verification_method"] == "id_portrait"
    calls = []
    def original_check(*args):
        calls.append(True)
        raise HTTPException(422, "Original ID comparison remains required")
    monkeypatch.setattr(ids, "verify_remote_identity", original_check)
    body = {**enrollment(content), "remote_face_verification_method": "registered_face", "user_id": 999}
    assert client.post("/api/auth/enroll-face", json=body).status_code == 422
    assert calls == [True]


@pytest.mark.parametrize("hint", ["spoof", "retry", "too_dark", "too_far"])
def test_registered_face_verification_cannot_bypass_live_pad(client, db_session, monkeypatch, hint):
    member, content = trusted_member(db_session)
    sign_in(client, member); mock_document(monkeypatch); mock_live(monkeypatch, hint=hint)
    def forbidden(*a, **kw): pytest.fail("A failed live check must stop before identity matching")
    monkeypatch.setattr(engine, "find_match_for_face", forbidden)
    monkeypatch.setattr(ids, "comparison_face", forbidden)
    assert client.post("/api/auth/enroll-face", json=enrollment(content)).status_code == 422


def test_registered_face_verification_still_requires_the_uploaded_and_saved_id_to_match(client, db_session, monkeypatch):
    member, content = trusted_member(db_session)
    sign_in(client, member); mock_checked_id(monkeypatch)
    def different_ids(frame, detected, **kwargs):
        return {"engine": "sface", "encoding": ([1.0, 0.0] if kwargs["label"] == "saved library ID" else [0.0, 1.0]) + [0.0] * 126}
    monkeypatch.setattr(ids, "comparison_face", different_ids)
    def forbidden(*a, **kw): pytest.fail("The original ID must match before the registered face can be used")
    monkeypatch.setattr(engine, "find_match_for_face", forbidden)
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == 422 and "uploaded ID portrait did not match" in result.json()["detail"]


@pytest.mark.parametrize("invalid", [float("nan"), float("inf")])
def test_corrupt_registered_descriptors_cannot_report_verification_success(client, db_session, monkeypatch, invalid):
    member, content = trusted_member(db_session)
    member.face_encoding = json.dumps([invalid] * 128); db_session.commit()
    sign_in(client, member); mock_checked_id(monkeypatch)
    assert client.post("/api/auth/enroll-face", json=enrollment(content)).status_code == 422


def test_duplicate_face_rule_is_preserved_without_replacing_the_reference(client, db_session, monkeypatch):
    from types import SimpleNamespace
    member, content = trusted_member(db_session)
    sign_in(client, member); mock_checked_id(monkeypatch)
    monkeypatch.setattr(engine, "find_duplicate_for_enrollment", lambda *a, **kw: SimpleNamespace())
    assert client.post("/api/auth/enroll-face", json=enrollment(content)).status_code == 409
    db_session.refresh(member)
    assert member.face_encoding == json.dumps([.1] * 128)


@pytest.mark.parametrize("method", ["self_id_checked", "librarian_assisted"])
def test_verified_enrollment_origin_and_timezone_aware_dates_are_supported(client, db_session, monkeypatch, method):
    from datetime import timezone
    member, content = trusted_member(db_session)
    member.face_consent_method = method
    member.id_verified_at = (now_ph() - timedelta(minutes=2)).astimezone(timezone.utc)
    member.face_consent_at = now_ph().astimezone(timezone.utc)
    if method == "self_id_checked":
        member.face_consent_recorded_by_id = member.id
        member.face_id_verified_at = now_ph().astimezone(timezone.utc)
    db_session.commit(); sign_in(client, member); mock_checked_id(monkeypatch)
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == 200 and result.json()["operation"] == "verified_existing"
    assert client.get("/api/user/profile").json()["remote_face_capture_mirrored"] == (method == "librarian_assisted")


def test_active_insightface_reference_is_supported_without_creating_or_upgrading_templates(client, db_session, monkeypatch):
    member, content = trusted_member(db_session)
    member.face_encoding = None
    values = [1.0] + [0.0] * 511
    stored = FaceEmbedding(user_id=member.id, engine="insightface", dimension=512,
        embedding=json.dumps(values), source="enrollment", is_active=True)
    db_session.add(stored); db_session.commit()
    sign_in(client, member); mock_checked_id(monkeypatch)
    monkeypatch.setattr(engine, "detect_faces", lambda *a, **kw: [{"engine": "insightface", "encoding": values,
        "face_box": face()["face_box"]}])
    result = client.post("/api/auth/enroll-face", json=enrollment(content))
    assert result.status_code == 200 and result.json()["enrollment_changed"] is False
    db_session.refresh(member); db_session.refresh(stored)
    assert member.face_encoding is None and stored.embedding == json.dumps(values)
    assert stored.is_active and db_session.query(FaceEmbedding).count() == 1


@pytest.mark.parametrize("state", ["anonymous", "suspended", "forced_password"])
def test_session_and_account_restrictions_still_apply(client, db_session, monkeypatch, state):
    member, content = trusted_member(db_session)
    if state != "anonymous": sign_in(client, member)
    if state == "suspended": member.status = "suspended"
    if state == "forced_password": member.must_change_password = True
    db_session.commit()
    def forbidden(*args, **kwargs): pytest.fail("Restricted accounts cannot start verification")
    monkeypatch.setattr(engine, "detect_faces", forbidden)
    assert client.post("/api/auth/enroll-face", json=enrollment(content)).status_code in {401, 403}


def test_invalid_matching_policy_cannot_report_existing_verification_success(client, db_session, monkeypatch):
    member, content = trusted_member(db_session)
    sign_in(client, member); mock_checked_id(monkeypatch)
    monkeypatch.setattr(engine, "FACE_MATCH_MARGIN", float("nan"))
    assert client.post("/api/auth/enroll-face", json=enrollment(content)).status_code == 503
