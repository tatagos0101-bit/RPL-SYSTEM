import json
import math

import pytest

from models.auth_session import AuthSession
from models.face_embedding import FaceEmbedding
from models.user import User
from routers.auth import _hash
from routers.users import PRIVACY_POLICY_VERSION
from services.face_enrollment_consent import FACE_CONSENT_VERSION


IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD"


def _member(db, *, name="Face Member", member_id="RPL-FACE1", dlib_encoding=None):
    user = User(
        name=name,
        email=f"{member_id.lower()}@example.test",
        password_hash=_hash("Password1"),
        role="member",
        member_id=member_id,
        face_encoding=json.dumps(dlib_encoding) if dlib_encoding is not None else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _librarian(db):
    user = User(
        name="Test Librarian",
        email="face-lib@example.test",
        password_hash=_hash("Password1"),
        role="librarian",
        member_id="RPL-FACELIB",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _token(client, email):
    response = client.post("/api/auth/login", json={"email": email, "password": "Password1"})
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.mark.parametrize("assisted", [False, True])
def test_enroll_face_stores_dlib_legacy_insightface_and_consent(client, db_session, monkeypatch, assisted):
    import services.face_engine_service as face_engine_service
    import services.liveness_service as liveness_service

    user = _member(db_session, dlib_encoding=None)
    actor = _librarian(db_session) if assisted else user
    token = _token(client, actor.email)
    path = f"/api/librarian/users/{user.id}/enroll-face" if assisted else "/api/auth/enroll-face"
    monkeypatch.setattr(liveness_service, "check_liveness", lambda _image: ("ok", 1.0))
    monkeypatch.setattr("services.anti_spoof_service.check_detected_faces_liveness", lambda *a: ("ok", 1.0))
    monkeypatch.setattr(
        face_engine_service,
        "detect_faces",
        lambda _image, max_faces=2, engines=None: [
            {
                "engine": "insightface",
                "encoding": [0.1] * 512,
                "dimension": 512,
                "face_box": {"top": 0.1, "left": 0.1, "width": 0.2, "height": 0.2},
                "quality": {"score": 0.92},
                "dlib_encoding": [0.2] * 128,
            }
        ],
    )
    monkeypatch.setattr(face_engine_service, "find_best_match", lambda db, encoding, engine, **kwargs: None)

    response = client.post(
        path,
        headers={"Authorization": f"Bearer {token}"},
        json={"image": IMAGE, "accept_face_recognition": True, "face_consent_version": FACE_CONSENT_VERSION},
    )

    assert response.status_code == 200
    db_session.refresh(user)
    assert json.loads(user.face_encoding) == [0.2] * 128
    assert user.face_consent_version == FACE_CONSENT_VERSION
    assert user.face_consent_at is not None
    assert user.face_consent_method == ("librarian_assisted" if assisted else "self")
    assert user.face_consent_recorded_by_id == actor.id
    stored = db_session.query(FaceEmbedding).filter_by(user_id=user.id, engine="insightface").one()
    assert stored.dimension == 512
    assert json.loads(stored.embedding) == [0.1] * 512
    assert stored.quality_score == pytest.approx(0.92)


@pytest.mark.parametrize("assisted", [False, True])
def test_face_enrollment_rejects_missing_or_invalid_consent_before_processing(client, db_session, monkeypatch, assisted):
    user = _member(db_session, dlib_encoding=[0.1])
    actor = _librarian(db_session) if assisted else user
    token = _token(client, actor.email)
    path = f"/api/librarian/users/{user.id}/enroll-face" if assisted else "/api/auth/enroll-face"

    def fail_if_processed(*args, **kwargs):
        pytest.fail("An enrollment without consent must not process the image")

    monkeypatch.setattr("services.liveness_service.check_liveness", fail_if_processed)
    monkeypatch.setattr("services.face_engine_service.detect_faces", fail_if_processed)
    invalid_consents = (
        ({}, "must agree"),
        ({"accept_face_recognition": False}, "must agree"),
        ({"accept_face_recognition": "true"}, None),
        ({"accept_face_recognition": True}, "current facial recognition notice"),
        ({"accept_face_recognition": True, "face_consent_version": "old"}, "current facial recognition notice"),
    )
    for consent, expected_detail in invalid_consents:
        response = client.post(path, headers={"Authorization": f"Bearer {token}"}, json={"image": IMAGE, **consent})
        assert response.status_code == 422
        if expected_detail:
            assert expected_detail in response.json()["detail"]
        else:
            assert response.json()["detail"][0]["loc"] == ["body", "accept_face_recognition"]

    db_session.refresh(user)
    assert json.loads(user.face_encoding) == [0.1]
    assert user.face_consent_at is None


def test_face_sign_in_cannot_replace_first_login_password_setup(client, db_session, monkeypatch):
    user = _member(db_session, dlib_encoding=[0.1])
    user.must_change_password = user.privacy_consent_pending = True
    db_session.commit()
    monkeypatch.setattr("config.ENTRY_STATION_PIN", "1234")
    monkeypatch.setattr("services.liveness_service.check_liveness", lambda _: ("ok", 1.0))
    monkeypatch.setattr("services.anti_spoof_service.check_detected_faces_liveness", lambda *a: ("ok", 1.0))
    monkeypatch.setattr("services.face_engine_service.detect_faces",
                        lambda *a, **kw: [{"engine": "dlib", "encoding": [0.1]}])

    sign_in = client.post("/api/auth/face", json={"image": IMAGE, "expected_role": "member"})
    assert sign_in.status_code == 403
    assert sign_in.json()["detail"]["code"] == "member_setup_required"
    assert "set-cookie" not in sign_in.headers
    assert db_session.query(AuthSession).filter_by(user_id=user.id).count() == 0

    attendance = client.post("/api/kiosk/face", json={"image": IMAGE, "station_pin": "1234"})
    assert attendance.status_code == 200 and attendance.json()["matched"]
    assert not attendance.json()["token"] and "set-cookie" not in attendance.headers

    _token(client, user.email)
    completed = client.put("/api/user/change-password", json={
        "new_password": "CompletedPass2", "accept_privacy_policy": True, "privacy_policy_version": PRIVACY_POLICY_VERSION,
    })
    assert completed.status_code == 200
    client.cookies.clear()
    sign_in = client.post("/api/auth/face", json={"image": IMAGE, "expected_role": "member"})
    assert sign_in.status_code == 200 and sign_in.json()["token"]
    assert "set-cookie" in sign_in.headers


def test_face_lookup_prefers_insightface_embedding_over_dlib(client, db_session, monkeypatch):
    import services.face_engine_service as face_engine_service
    import services.liveness_service as liveness_service

    librarian = _librarian(db_session)
    token = _token(client, librarian.email)
    user = _member(db_session, name="Insight Member", member_id="RPL-INSIGHT", dlib_encoding=[9.0, 9.0])
    db_session.add(
        FaceEmbedding(
            user_id=user.id,
            engine="insightface",
            dimension=512,
            embedding=json.dumps([0.12] * 512),
            quality_score=0.9,
            source="enrollment",
            is_active=True,
        )
    )
    db_session.commit()

    monkeypatch.setattr(liveness_service, "check_liveness", lambda _image: ("ok", 1.0))
    monkeypatch.setattr("services.anti_spoof_service.check_detected_faces_liveness", lambda *a: ("ok", 1.0))
    monkeypatch.setattr(
        face_engine_service,
        "detect_faces",
        lambda _image, max_faces=2, engines=None: [
            {
                "engine": "insightface",
                "encoding": [0.12] * 512,
                "dimension": 512,
                "face_box": {"top": 0.1, "left": 0.2, "width": 0.2, "height": 0.2},
                "quality": {"score": 0.88},
            }
        ],
    )

    response = client.post(
        "/api/auth/face-lookup",
        headers={"Authorization": f"Bearer {token}"},
        json={"image": IMAGE},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["matched"] is True
    assert body["name"] == "Insight Member"
    assert body["engine"] == "insightface"
    assert body["score"] == pytest.approx(0.0)


def test_insightface_matching_uses_cosine_distance(db_session):
    import services.face_engine_service as face_engine_service

    user = _member(db_session, name="Cosine Member", member_id="RPL-COSINE")
    db_session.add(
        FaceEmbedding(
            user_id=user.id,
            engine="insightface",
            dimension=2,
            embedding=json.dumps([1.0, 0.0]),
            quality_score=0.9,
            source="enrollment",
            is_active=True,
        )
    )
    db_session.commit()

    live_encoding = [0.7, math.sqrt(1 - 0.7**2)]
    match = face_engine_service.find_best_match(
        db_session,
        live_encoding,
        "insightface",
        threshold=0.40,
    )

    assert match is not None
    assert match.user.id == user.id
    assert match.score == pytest.approx(0.30)


def test_face_lookup_falls_back_to_legacy_dlib_when_insightface_embedding_missing(client, db_session, monkeypatch):
    import services.face_engine_service as face_engine_service
    import services.liveness_service as liveness_service

    librarian = _librarian(db_session)
    token = _token(client, librarian.email)
    user = _member(db_session, name="Legacy Member", member_id="RPL-LEGACY", dlib_encoding=[0.3, 0.3])

    monkeypatch.setattr(liveness_service, "check_liveness", lambda _image: ("ok", 1.0))
    monkeypatch.setattr("services.anti_spoof_service.check_detected_faces_liveness", lambda *a: ("ok", 1.0))
    monkeypatch.setattr(
        face_engine_service,
        "detect_faces",
        lambda _image, max_faces=2, engines=None: [
            {
                "engine": "dlib",
                "encoding": [0.3, 0.3],
                "dimension": 2,
                "face_box": {"top": 0.1, "left": 0.2, "width": 0.2, "height": 0.2},
                "quality": {"score": 0.8},
            }
        ],
    )

    response = client.post(
        "/api/auth/face-lookup",
        headers={"Authorization": f"Bearer {token}"},
        json={"image": IMAGE},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["matched"] is True
    assert body["name"] == "Legacy Member"
    assert body["engine"] == "dlib"


def test_kiosk_face_returns_engine_score_and_quality_for_each_face(client, db_session, monkeypatch):
    import services.face_engine_service as face_engine_service
    import services.liveness_service as liveness_service

    user = _member(db_session, name="Gate Member", member_id="RPL-GATE", dlib_encoding=[0.0, 0.0])
    db_session.add(
        FaceEmbedding(
            user_id=user.id,
            engine="insightface",
            dimension=512,
            embedding=json.dumps([0.4] * 512),
            quality_score=0.95,
            source="enrollment",
            is_active=True,
        )
    )
    db_session.commit()

    monkeypatch.setattr(liveness_service, "check_liveness", lambda _image: ("ok", 1.0))
    monkeypatch.setattr("services.anti_spoof_service.check_detected_faces_liveness", lambda *a: ("ok", 1.0))
    monkeypatch.setattr(
        face_engine_service,
        "detect_faces",
        lambda _image, max_faces=4, engines=None: [
            {
                "engine": "insightface",
                "encoding": [0.4] * 512,
                "dimension": 512,
                "face_box": {"top": 0.2, "left": 0.3, "width": 0.2, "height": 0.2},
                "quality": {"score": 0.91},
            }
        ],
    )

    response = client.post(
        "/api/kiosk/face",
        json={"station_pin": "1234", "image": IMAGE},
    )

    assert response.status_code == 200
    face = response.json()["faces"][0]
    assert face["matched"] is True
    assert face["name"] == "Gate Member"
    assert face["engine"] == "insightface"
    assert face["score"] == pytest.approx(0.0)
    assert face["quality"]["score"] == pytest.approx(0.91)
