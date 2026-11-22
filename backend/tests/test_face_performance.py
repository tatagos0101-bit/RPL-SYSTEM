import base64
import io
from types import SimpleNamespace

import numpy as np
from PIL import Image
import pytest
from sqlalchemy import event

from services import anti_spoof_service as pad, face_service, liveness_service, face_engine_service
from services.face_frame import frame_scope, current_frame


def frame(color=(160, 140, 120)):
    output = io.BytesIO()
    Image.new("RGB", (320, 240), color).save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


def test_scan_decodes_once_and_preserves_rgb_bgr(monkeypatch):
    original = Image.open
    calls = []
    monkeypatch.setattr(Image, "open", lambda *a, **k: (calls.append(1), original(*a, **k))[1])
    image = frame()
    with frame_scope() as state:
        rgb = face_service._decode_base64_image(image)
        bgr = liveness_service._decode_base64_image(image)
        assert liveness_service._decode_base64_image(image) is bgr
        assert rgb[0, 0].tolist() == [160, 140, 120]
        assert bgr[0, 0].tolist() == [120, 140, 160]
        assert len(calls) == 1
    assert current_frame() is None
    assert state.source is None and not state.galleries and not state.predictions


def test_changed_image_and_next_request_cannot_reuse_previous_pixels():
    with frame_scope():
        first = liveness_service._decode_base64_image(frame())
        second = liveness_service._decode_base64_image(frame((80, 90, 100)))
        assert not np.array_equal(first, second)
    with frame_scope():
        third = liveness_service._decode_base64_image(frame())
        assert third is not first


def test_frame_state_is_cleared_after_failure():
    with pytest.raises(RuntimeError):
        with frame_scope() as state:
            liveness_service._decode_base64_image(frame())
            raise RuntimeError("synthetic failure")
    assert current_frame() is None and state.source is None


def test_exact_pad_tensor_is_reused_only_inside_current_scan(monkeypatch):
    forwards = []
    model = SimpleNamespace(setInput=lambda _: None,
                            forward=lambda: (forwards.append(1), np.array([[0., 12., 0.]]))[1])
    monkeypatch.setattr(pad, "_load_models", lambda: [(2.7, model)])
    for expected in [1, 2]:
        with frame_scope():
            image = liveness_service._decode_base64_image(frame())
            assert pad.score_face(image, (64, 48, 128, 96))[0] == "ok"
            assert pad.score_face(image, (64, 48, 128, 96))[0] == "ok"
            assert len(forwards) == expected
            assert pad.score_face(image, (10, 10, 20, 20))[0] == "too_far"


def test_different_pad_pixels_are_not_reused(monkeypatch):
    forwards = []
    model = SimpleNamespace(setInput=lambda _: None,
                            forward=lambda: (forwards.append(1), np.array([[0., 12., 0.]]))[1])
    monkeypatch.setattr(pad, "_load_models", lambda: [(2.7, model)])
    with frame_scope():
        for color in [(160, 140, 120), (130, 150, 180)]:
            image = liveness_service._decode_base64_image(frame(color))
            assert pad.score_face(image, (64, 48, 128, 96))[0] == "ok"
    assert len(forwards) == 2


def test_two_faces_in_one_frame_cannot_share_different_pad_inputs(monkeypatch):
    forwards = []
    def infer():
        forwards.append(1)
        return np.array([[0., 12., 0.]]) if len(forwards) == 1 else np.array([[12., 0., 0.]])
    model = SimpleNamespace(setInput=lambda _: None, forward=infer)
    monkeypatch.setattr(pad, "_load_models", lambda: [(2.7, model)])
    image = np.full((480, 640, 3), 120, np.uint8)
    image[:, 320:] = 200
    with frame_scope():
        assert pad.score_face(image, (70, 180, 100, 100))[0] == "ok"
        assert pad.score_face(image, (450, 180, 100, 100))[0] == "spoof"
        assert pad.score_face(image, (70, 180, 100, 100))[0] == "ok"
    assert len(forwards) == 2


def test_concurrent_scan_scopes_are_isolated():
    import asyncio
    async def scan(color):
        with frame_scope() as state:
            rgb = face_service._decode_base64_image(frame(color))
            await asyncio.sleep(0)
            assert current_frame() is state
            assert face_service._decode_base64_image(frame(color)) is rgb
            assert rgb[0, 0].tolist() == list(color)
        assert state.source is None
    async def both():
        await asyncio.gather(scan((160, 140, 120)), scan((90, 100, 110)))
    asyncio.run(both())
    assert current_frame() is None


def test_numeric_timings_do_not_include_image_or_identity(client):
    image = frame((0, 0, 0))
    response = client.post("/api/auth/face", json={"image": image})
    assert response.status_code == 200 and response.json()["message"] == "too_dark"
    header = response.headers["server-timing"]
    assert "total;dur=" in header and "decode;dur=" in header
    assert image not in header and "base64" not in header
    assert current_frame() is None


def test_multi_face_gallery_is_read_once_but_deleted_template_is_revalidated(db_session):
    import json
    from sqlalchemy.orm import Session
    from models.user import User
    from timezone_utils import now_ph

    member = User(name="Synthetic gallery member", password_hash="unused",
                  face_encoding=json.dumps([.1, .1]), member_id="SYN-PERF")
    db_session.add(member); db_session.commit()
    target_id = member.id
    statements = []
    engine = db_session.get_bind()
    def collect(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)
    event.listen(engine, "before_cursor_execute", collect)
    try:
        with frame_scope():
            for _ in range(3):
                match = face_engine_service.find_best_match(db_session, [.1, .1], "dlib")
                assert match.user.id == target_id
            assert len(statements) == 1
            with Session(engine) as other:
                other_member = other.get(User, target_id)
                other_member.face_encoding = None
                other_member.deleted_at = now_ph()
                other.commit()
            face = {"engine": "dlib", "encoding": [.1, .1]}
            assert face_engine_service.find_match_for_face(db_session, face) is None
    finally:
        event.remove(engine, "before_cursor_execute", collect)
