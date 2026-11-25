"""Synthetic pixels/descriptors only. These do not measure real-camera accuracy."""
import base64
import hashlib
import io
from types import SimpleNamespace

from fastapi import HTTPException
import numpy as np
from PIL import Image
import pytest

from services import face_engine_service as engine
from services import face_service
from services import identity_documents as ids
from services import identity_portraits as portraits


BOX = {"top": .2, "left": .3, "width": .3, "height": .4}


def photo():
    output = io.BytesIO()
    Image.new("RGB", (900, 600), (171, 103, 57)).save(output, "PNG")
    return output.getvalue()


def frame():
    return "data:image/png;base64," + base64.b64encode(photo()).decode()


def face(offset=.1, selected="dlib", fallback=False):
    result = {"engine": selected, "encoding": [offset] * (128 if selected == "dlib" else 512), "face_box": BOX}
    if fallback: result["dlib_encoding"] = [.1] * 128
    return result


def test_document_frame_is_lossless_and_exif_transpose_is_preserved():
    rgb = np.indices((600, 900)).sum(axis=0) % 2 * 255
    image = Image.fromarray(np.repeat(rgb[:, :, None], 3, axis=2).astype(np.uint8))
    output = io.BytesIO(); image.save(output, "PNG")
    decoded, encoded = ids.document_image(output.getvalue())
    assert encoded.startswith("data:image/png;base64,")
    with Image.open(io.BytesIO(base64.b64decode(encoded.split(",", 1)[1]))) as prepared:
        assert np.array_equal(decoded, np.asarray(prepared))
        assert np.array_equal(decoded, np.asarray(image))
    rotated = Image.new("RGB", (900, 600), "white")
    exif = rotated.getexif(); exif[274] = 6
    output = io.BytesIO(); rotated.save(output, "JPEG", exif=exif)
    assert ids.document_image(output.getvalue())[0].shape[:2] == (900, 600)


def test_crop_is_bounded_keeps_rgb_and_does_not_mutate_source():
    rgb = np.full((600, 900, 3), [171, 103, 57], dtype=np.uint8)
    before = rgb.copy()
    crop, (top, right, bottom, left) = portraits._portrait_crop(rgb, BOX, "uploaded ID")
    assert max(crop.shape[:2]) <= 1024
    assert 0 <= left < right <= crop.shape[1] and 0 <= top < bottom <= crop.shape[0]
    assert crop[0, 0].tolist() == [171, 103, 57]
    assert np.array_equal(rgb, before)


@pytest.mark.parametrize("face_pixels", [80, 120, 180, 320, 660])
def test_id_and_live_comparison_faces_have_one_scale_before_native_alignment(face_pixels):
    size = face_pixels * 2
    rgb = np.full((size, size, 3), [171, 103, 57], np.uint8)
    box = {"top": .25, "left": .25, "width": .5, "height": .5}
    crop, (top, right, bottom, left) = portraits._portrait_crop(rgb, box, "synthetic portrait")
    assert abs((right - left) - 160) <= 1
    assert abs((bottom - top) - 160) <= 1
    assert max(crop.shape[:2]) <= 274
    assert crop[0, 0].tolist() == [171, 103, 57]


def test_fine_grid_is_antialiased_before_comparison_alignment():
    # A high-frequency synthetic grid, not a face/ID. Direct bilinear warp
    # subsamples its stripes; pre-resizing must average them at the same scale.
    indices = np.indices((1320, 1320))
    pixels = np.repeat(((indices.sum(axis=0) % 2) * 255).astype(np.uint8)[:, :, None], 3, axis=2)
    crop, (top, right, bottom, left) = portraits._portrait_crop(pixels,
        {"top": .25, "left": .25, "width": .5, "height": .5}, "synthetic grid")
    assert abs((right - left) - 160) <= 1 and abs((bottom - top) - 160) <= 1
    assert crop[10:-10, 10:-10].std() < 1


@pytest.mark.parametrize("box", [None, {}, {**BOX, "width": 0}, {**BOX, "top": -1},
    {**BOX, "left": float("nan")}, {**BOX, "height": float("inf")}, {**BOX, "width": 2},
    {**BOX, "width": .01}, {**BOX, "height": .01}])
def test_missing_invalid_or_tiny_portraits_cannot_become_matches(box):
    with pytest.raises(HTTPException) as failure:
        portraits._portrait_crop(np.zeros((600, 900, 3), np.uint8), box, "saved library ID")
    assert failure.value.status_code == 422
    assert "saved library ID" in failure.value.detail


@pytest.mark.parametrize("box", [{**BOX, "left": 0, "top": 0}, {**BOX, "left": .7, "top": .6},
    {"top": 0, "left": 0, "width": 1, "height": 1}])
def test_portraits_at_image_edges_stay_inside_bounded_crop(box):
    crop, (top, right, bottom, left) = portraits._portrait_crop(np.zeros((1600, 1600, 3), np.uint8), box, "ID")
    assert max(crop.shape[:2]) <= 1024
    assert 0 <= left < right <= crop.shape[1] and 0 <= top < bottom <= crop.shape[0]


def test_dlib_comparison_reuses_detected_face_in_rgb_with_bounded_averaging(monkeypatch):
    calls = []
    def encode(rgb, *, known_face_locations, num_jitters, model):
        calls.append((rgb, known_face_locations, num_jitters, model))
        return [np.full(128, .125)]
    monkeypatch.setattr(face_service, "FACE_LIB_AVAILABLE", True)
    monkeypatch.setattr(face_service.face_recognition, "face_encodings", encode)
    detected = face()
    result = portraits.comparison_face(frame(), detected, engine_name="dlib", label="uploaded ID")
    assert result == {"engine": "dlib", "encoding": [.125] * 128}
    assert len(calls) == 1 and calls[0][2:] == (3, "small")
    assert calls[0][0][0, 0].tolist() == [171, 103, 57]
    assert len(calls[0][1]) == 1
    assert detected["encoding"] == [.1] * 128  # Never replace the sign-in template.


def test_insightface_comparison_uses_bgr_and_never_changes_configured_engine(monkeypatch):
    calls = []
    app = SimpleNamespace(get=lambda bgr: (calls.append(bgr), [SimpleNamespace(normed_embedding=np.full(512, .1))])[1])
    monkeypatch.setattr(engine, "_get_insightface_app", lambda: app)
    result = portraits.comparison_face(frame(), face(selected="insightface"), engine_name="insightface", label="live camera")
    assert result["engine"] == "insightface" and len(result["encoding"]) == 512
    assert calls[0][0, 0].tolist() == [57, 103, 171]


@pytest.mark.skipif(not face_service.FACE_LIB_AVAILABLE, reason="Native dlib runtime is not installed")
def test_native_encoder_accepts_the_bounded_rgb_crop_without_retaining_files(tmp_path):
    # An existing detector result is simulated. This tests native API compatibility,
    # not whether the model recognizes these synthetic pixels as a person's face.
    from services.face_frame import frame_scope
    before = set(tmp_path.rglob("*"))
    with frame_scope() as state:
        result = portraits.comparison_face(frame(), face(), engine_name="dlib", label="synthetic ID")
        assert result["engine"] == "dlib" and len(result["encoding"]) == 128
        assert np.isfinite(result["encoding"]).all()
    assert state.source is None and state.rgb is None
    assert set(tmp_path.rglob("*")) == before


@pytest.mark.parametrize("vectors,code", [([], 422), ([np.ones(128), np.ones(128)], 422),
    ([np.zeros(128)], 503), ([np.full(128, float("nan"))], 503), ([np.ones(127)], 503)])
def test_no_multiple_nonfinite_zero_or_wrong_size_descriptor_can_pass(monkeypatch, vectors, code):
    monkeypatch.setattr(face_service, "FACE_LIB_AVAILABLE", True)
    monkeypatch.setattr(face_service.face_recognition, "face_encodings", lambda *a, **kw: vectors)
    with pytest.raises(HTTPException) as failure:
        portraits.comparison_face(frame(), face(), engine_name="dlib", label="ID")
    assert failure.value.status_code == code


def test_encoder_errors_are_unavailable_and_do_not_expose_images_or_native_errors(monkeypatch):
    monkeypatch.setattr(face_service, "FACE_LIB_AVAILABLE", True)
    def fail(*a, **kw): raise RuntimeError("synthetic-private-frame-or-descriptor")
    monkeypatch.setattr(face_service.face_recognition, "face_encodings", fail)
    with pytest.raises(HTTPException) as failure:
        portraits.comparison_face(frame(), face(), engine_name="dlib", label="ID")
    assert failure.value.status_code == 503
    assert "synthetic-private" not in failure.value.detail and "base64" not in failure.value.detail


def setup_comparison(monkeypatch):
    from services import storage_service
    content = photo()
    member = SimpleNamespace(id_image_url="/uploads/ids/synthetic.png", id_document_digest=hashlib.sha256(content).hexdigest(),
        id_document_type="national_id", id_verified_at=1, id_verified_by_id=1)
    monkeypatch.setattr(storage_service, "read_private_upload", lambda *a, **kw: content)
    monkeypatch.setattr(ids, "inspect_document", lambda raw: ids.DocumentCheck(hashlib.sha256(raw).hexdigest(), "national_id", None, None, face()))
    monkeypatch.setattr(ids, "document_face", lambda image: face())
    return member, base64.b64encode(content).decode()


@pytest.mark.parametrize("offsets,message,count", [
    ((1, 0, 0), "uploaded ID portrait did not match", 2),
    ((0, 0, 1), "saved library ID portrait", 3),
    ((.025, 0, -.025), "uploaded ID portrait", 3),
])
def test_each_failed_comparison_has_a_specific_safe_message(monkeypatch, offsets, message, count):
    member, content = setup_comparison(monkeypatch)
    vectors = iter(offsets); labels = []
    def compare(frame, detected, **kw):
        labels.append(kw["label"])
        return face(next(vectors))
    monkeypatch.setattr(ids, "comparison_face", compare)
    with pytest.raises(HTTPException) as failure:
        ids.verify_remote_identity(member, content, face(), "synthetic-live")
    assert failure.value.status_code == 422 and message in failure.value.detail
    assert len(labels) == count
    assert not any(word in failure.value.detail for word in ("score=", "base64", "encoding"))


def test_three_matching_comparisons_use_one_engine_and_leave_live_template_unchanged(monkeypatch):
    member, content = setup_comparison(monkeypatch)
    calls = []; live = face(.2)
    def compare(frame, detected, **kw):
        calls.append(kw)
        return face(.1)
    monkeypatch.setattr(ids, "comparison_face", compare)
    ids.verify_remote_identity(member, content, live, "synthetic-live")
    assert [call["label"] for call in calls] == ["uploaded ID", "saved library ID", "live camera"]
    assert {call["engine_name"] for call in calls} == {"sface"}
    assert live["encoding"] == [.2] * 128


def test_different_source_detectors_use_the_same_dedicated_verifier(monkeypatch):
    member, content = setup_comparison(monkeypatch)
    calls = []
    def compare(frame, detected, **kw):
        calls.append(kw["engine_name"])
        return face()
    monkeypatch.setattr(ids, "comparison_face", compare)
    ids.verify_remote_identity(member, content, face(selected="insightface"), "synthetic-live")
    assert calls == ["sface"] * 3


def test_mixed_engines_with_dlib_support_all_use_the_same_comparison_encoder(monkeypatch):
    member, content = setup_comparison(monkeypatch)
    calls = []
    def compare(frame, detected, **kw):
        calls.append(kw["engine_name"])
        return face()
    monkeypatch.setattr(ids, "comparison_face", compare)
    ids.verify_remote_identity(member, content, face(selected="insightface", fallback=True), "synthetic-live")
    assert calls == ["sface"] * 3


def test_matching_threshold_is_not_relaxed_for_id_comparisons():
    threshold = engine._purpose_threshold("login", "dlib")
    base = face(0)
    below = face((threshold - .0001) / np.sqrt(128))
    above = face((threshold + .0001) / np.sqrt(128))
    assert ids._same_face(base, below)
    assert not ids._same_face(base, above)


def test_support_quality_is_numeric_only_and_does_not_return_pixels(monkeypatch):
    monkeypatch.setattr(portraits, "decode_rgb", lambda frame: np.full((600, 900, 3), [170, 100, 50], np.uint8))
    result = portraits.portrait_quality("synthetic-private-frame", face())
    assert set(result) == {"width_px", "height_px", "brightness", "contrast", "sharpness"}
    assert result["width_px"] == 270 and result["height_px"] == 240
    assert all(isinstance(value, (int, float)) for value in result.values())
    monkeypatch.setattr(portraits, "decode_rgb", lambda frame: None)
    assert portraits.portrait_quality("synthetic-private-frame", face()) == {}
