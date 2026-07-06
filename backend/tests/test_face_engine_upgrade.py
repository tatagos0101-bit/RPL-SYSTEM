import json
import math

import pytest

from models.face_embedding import FaceEmbedding
from models.user import User
from routers.auth import _hash


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


def test_enroll_face_stores_dlib_legacy_and_insightface_embedding(client, db_session, monkeypatch):
    import services.face_engine_service as face_engine_service
    import services.liveness_service as liveness_service

    user = _member(db_session, dlib_encoding=None)
    token = _token(client, user.email)
    monkeypatch.setattr(liveness_service, "check_liveness", lambda _image: ("ok", 1.0))
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
        "/api/auth/enroll-face",
        headers={"Authorization": f"Bearer {token}"},
        json={"image": IMAGE},
    )

    assert response.status_code == 200
    db_session.refresh(user)
    assert json.loads(user.face_encoding) == [0.2] * 128
    stored = db_session.query(FaceEmbedding).filter_by(user_id=user.id, engine="insightface").one()
    assert stored.dimension == 512
    assert json.loads(stored.embedding) == [0.1] * 512
    assert stored.quality_score == pytest.approx(0.92)


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
