import base64
import io
import os
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image, ImageOps
import pytest

from models.entry_log import EntryLog
from models.face_embedding import FaceEmbedding
from models.user import User
from routers.auth import _make_token
from services import anti_spoof_service as pad, face_engine_service, liveness_service


IMAGE = "data:image/jpeg;base64," + base64.b64encode(b"invalid").decode()
FACE = {"face_box": {"left": .2, "top": .2, "width": .4, "height": .4}}


def _frame():
    image = Image.new("RGB", (640, 480), (160, 140, 130))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


@pytest.mark.parametrize("hint", ["spoof", "too_far", "liveness_uncertain", "retry", "unexpected", "unavailable"])
@pytest.mark.parametrize("path", ["/api/auth/face", "/api/kiosk/face", "/api/auth/face-lookup"])
def test_failed_precheck_cannot_authenticate_or_log_access(client, db_session, monkeypatch, path, hint):
    staff = User(name="PAD staff", email="pad@example.test", role="librarian", password_hash="unused")
    db_session.add(staff); db_session.commit()
    monkeypatch.setattr(liveness_service, "check_liveness", lambda _: (hint, .1))
    monkeypatch.setattr(face_engine_service, "detect_faces", lambda *a, **k: pytest.fail("Failed PAD must not recognize faces"))
    response = client.post(path, json={"image": IMAGE, "station_pin": "1234"},
                           headers={"Authorization": f"Bearer {_make_token(staff.id)}"})
    assert response.status_code == (503 if hint == "unavailable" else 200)
    assert not response.json().get("matched")
    assert not response.json().get("token")
    assert "set-cookie" not in response.headers
    assert db_session.query(EntryLog).count() == 0


@pytest.mark.parametrize("path", ["/api/auth/face", "/api/kiosk/face", "/api/auth/face-lookup"])
def test_recognition_box_check_blocks_photo_missed_by_precheck(client, db_session, monkeypatch, path):
    staff = User(name="PAD staff", email="pad@example.test", role="librarian", password_hash="unused")
    db_session.add(staff); db_session.commit()
    monkeypatch.setattr(liveness_service, "check_liveness", lambda _: ("ok", .99))
    monkeypatch.setattr(face_engine_service, "detect_faces", lambda *a, **k: [FACE])
    monkeypatch.setattr(pad, "score_face", lambda *a: ("spoof", .01))
    monkeypatch.setattr(face_engine_service, "find_match_for_face", lambda *a, **k: pytest.fail("No identity match before PAD"))
    response = client.post(path, json={"image": _frame(), "station_pin": "1234"},
                           headers={"Authorization": f"Bearer {_make_token(staff.id)}"})
    assert response.status_code == 200
    assert response.json()["message"] == "Spoofing Detected"
    assert not response.json()["matched"] and not response.json().get("token")
    assert "set-cookie" not in response.headers
    assert db_session.query(EntryLog).count() == 0


def test_mixed_live_and_photo_frame_is_rejected_before_any_access(client, db_session, monkeypatch):
    monkeypatch.setattr(liveness_service, "check_liveness", lambda _: ("ok", .99))
    monkeypatch.setattr(face_engine_service, "detect_faces", lambda *a, **k: [FACE, FACE])
    scores = iter([("ok", .99), ("spoof", .01)])
    monkeypatch.setattr(pad, "score_face", lambda *a: next(scores))
    monkeypatch.setattr(face_engine_service, "find_match_for_face", lambda *a, **k: pytest.fail("Mixed frame must not grant access"))
    response = client.post("/api/kiosk/face", json={"image": _frame(), "station_pin": "1234"})
    assert response.json()["message"] == "Spoofing Detected"
    assert db_session.query(EntryLog).count() == 0


@pytest.mark.parametrize("assisted", [False, True])
def test_photo_cannot_overwrite_enrollment(client, db_session, monkeypatch, assisted):
    staff = User(name="Staff", email="staff-pad@example.test", role="librarian", password_hash="unused")
    member = User(name="Member", email="member-pad@example.test", role="member", password_hash="unused", face_encoding="[0.1]")
    db_session.add_all([staff, member]); db_session.commit()
    monkeypatch.setattr(liveness_service, "check_liveness", lambda _: ("ok", .99))
    monkeypatch.setattr(face_engine_service, "detect_faces", lambda *a, **k: [FACE])
    monkeypatch.setattr(pad, "score_face", lambda *a: ("spoof", .01))
    who = staff if assisted else member
    path = f"/api/librarian/users/{member.id}/enroll-face" if assisted else "/api/auth/enroll-face"
    response = client.post(path, json={"image": _frame()}, headers={"Authorization": f"Bearer {_make_token(who.id)}"})
    assert response.status_code == 422
    db_session.refresh(member)
    assert member.face_encoding == "[0.1]"
    assert db_session.query(FaceEmbedding).count() == 0


def test_bundled_models_load_and_missing_models_fail_closed(monkeypatch, tmp_path):
    pad._load_models.cache_clear()
    assert len(pad._load_models()) == 2
    pad._load_models.cache_clear()
    monkeypatch.setattr(pad, "MODEL_DIR", tmp_path)
    try:
        assert pad.check_detected_faces_liveness(_frame(), [FACE]) == ("unavailable", 0.0)
    finally:
        pad._load_models.cache_clear()


def test_corrupt_model_checksum_is_rejected(monkeypatch, tmp_path):
    (tmp_path / pad.MODEL_SPECS[0][0]).write_bytes(b"not the trusted model")
    pad._load_models.cache_clear()
    monkeypatch.setattr(pad, "MODEL_DIR", tmp_path)
    try:
        assert pad.check_detected_faces_liveness(_frame(), [FACE]) == ("unavailable", 0.0)
    finally:
        pad._load_models.cache_clear()


def test_invalid_model_output_fails_closed(monkeypatch):
    model = SimpleNamespace(setInput=lambda _: None, forward=lambda: np.array([[np.nan, 1, 0]]))
    monkeypatch.setattr(pad, "_load_models", lambda: [(2.7, model)])
    assert pad.check_detected_faces_liveness(_frame(), [FACE]) == ("unavailable", 0.0)


@pytest.mark.parametrize("box", [{}, {"left": float("nan"), "top": .1, "width": .4, "height": .4},
                                 {"left": .9, "top": .1, "width": .4, "height": .4}])
def test_invalid_face_geometry_is_not_accepted(box):
    assert pad.check_detected_faces_liveness(_frame(), [{"face_box": box}])[0] != "ok"


def test_tiny_face_cannot_bypass_model_check():
    assert pad.score_face(np.full((480, 640, 3), 150, np.uint8), (10, 10, 40, 40))[0] == "too_far"


# Opt-in reference images are public upstream samples, never library/user data.
# See assets/anti_spoof/README.md for fetching them and running this real-model check.
REFERENCE_DIR = Path(os.environ.get("PAD_REFERENCE_DIR", Path(__file__).resolve().parents[2] / ".tools/silent-face-eval/images/sample"))


@pytest.mark.parametrize("name,expected", [("image_F1.jpg", "spoof"), ("image_F2.jpg", "spoof"), ("image_T1.jpg", "ok")])
@pytest.mark.parametrize("jpeg_quality", [None, 65, 90])
def test_real_models_on_upstream_presentations(name, expected, jpeg_quality):
    path = REFERENCE_DIR / name
    if not path.exists():
        pytest.skip("Set PAD_REFERENCE_DIR to the upstream reference sample directory")
    raw = path.read_bytes()
    if jpeg_quality:
        output = io.BytesIO()
        ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).save(output, format="JPEG", quality=jpeg_quality)
        raw = output.getvalue()
    frame = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
    assert liveness_service.check_liveness(frame)[0] == expected
    faces = face_engine_service.detect_faces(frame, max_faces=2, engines=["dlib"])
    assert faces
    assert pad.check_detected_faces_liveness(frame, faces)[0] == expected


@pytest.mark.parametrize("path", ["/api/auth/face", "/api/kiosk/face", "/api/auth/face-lookup"])
@pytest.mark.parametrize("name,accepted", [("image_F1.jpg", False), ("image_F2.jpg", False), ("image_T1.jpg", True)])
def test_reference_models_and_recognition_end_to_end(client, db_session, monkeypatch, path, name, accepted):
    """Even an EXACT identity match must not bypass the real spoof classifier."""
    import json
    sample = REFERENCE_DIR / name
    if not sample.exists():
        pytest.skip("Set PAD_REFERENCE_DIR to the upstream reference sample directory")
    monkeypatch.setattr(face_engine_service, "FACE_ENGINE", "dlib")
    frame = "data:image/jpeg;base64," + base64.b64encode(sample.read_bytes()).decode()
    detected = face_engine_service.detect_faces(frame, max_faces=2)
    assert len(detected) == 1
    member = User(name="Reference fixture", email="reference@example.test", role="member",
                  password_hash="unused", face_encoding=json.dumps(detected[0]["encoding"]))
    staff = User(name="Reference staff", email="reference-staff@example.test", role="librarian", password_hash="unused")
    db_session.add_all([member, staff]); db_session.commit()
    response = client.post(path, json={"image": frame, "station_pin": "1234"},
                           headers={"Authorization": f"Bearer {_make_token(staff.id)}"})
    assert response.status_code == 200
    assert response.json()["matched"] is accepted
    assert bool(response.json().get("token")) is (accepted and path == "/api/auth/face")
    assert bool(response.headers.get("set-cookie")) is (accepted and path == "/api/auth/face")
    assert db_session.query(EntryLog).filter_by(granted=True).count() == int(accepted and path == "/api/kiosk/face")


@pytest.mark.parametrize("assisted", [False, True])
@pytest.mark.parametrize("name,accepted", [("image_F1.jpg", False), ("image_F2.jpg", False), ("image_T1.jpg", True)])
def test_reference_models_protect_enrollment(client, db_session, monkeypatch, assisted, name, accepted):
    sample = REFERENCE_DIR / name
    if not sample.exists():
        pytest.skip("Set PAD_REFERENCE_DIR to the upstream reference sample directory")
    monkeypatch.setattr(face_engine_service, "FACE_ENGINE", "dlib")
    frame = "data:image/jpeg;base64," + base64.b64encode(sample.read_bytes()).decode()
    staff = User(name="Reference staff", email="reference-staff@example.test", role="librarian", password_hash="unused")
    member = User(name="Reference member", email="reference-member@example.test", role="member", password_hash="unused")
    db_session.add_all([staff, member]); db_session.commit()
    who = staff if assisted else member
    path = f"/api/librarian/users/{member.id}/enroll-face" if assisted else "/api/auth/enroll-face"
    response = client.post(path, json={"image": frame}, headers={"Authorization": f"Bearer {_make_token(who.id)}"})
    assert response.status_code == (200 if accepted else 422)
    db_session.refresh(member)
    assert bool(member.face_encoding) is accepted
    # Dlib enrollment lives in User.face_encoding; other engines use this table.
    assert db_session.query(FaceEmbedding).count() == 0
    assert db_session.query(EntryLog).count() == 0
