"""Synthetic pixels/vectors only; no real ID or measured biometric accuracy."""
from types import SimpleNamespace

from fastapi import HTTPException
import numpy as np
import pytest

from services import face_engine_service as engine
from services import id_face_verifier as verifier
from services import identity_documents as ids
from services import identity_portraits as portraits
from services.face_frame import frame_scope


def detection():
    return np.array([[50, 50, 200, 200, 105, 110, 195, 110, 150, 155, 115, 200, 185, 200, .99]], dtype=np.float32)


def descriptor(angle=0.0):
    values = np.zeros(128)
    values[:2] = [np.cos(angle), np.sin(angle)]
    return {"engine": "sface", "encoding": values.tolist()}


def test_sface_never_compares_legacy_vectors_or_accepts_nonfinite_and_zero_values():
    assert ids._same_face(descriptor(), descriptor())
    assert not ids._same_face(descriptor(), descriptor(np.pi / 2))
    assert not ids._same_face(descriptor(), {"engine": "dlib", "encoding": descriptor()["encoding"]})
    assert not ids._same_face({"engine": "dlib", "encoding": descriptor()["encoding"]}, descriptor())
    for values in ([0.0] * 128, [float("nan")] * 128, [float("inf")] * 128, [1.0] * 127, None):
        assert not ids._same_face(descriptor(), {"engine": "sface", "encoding": values})


def test_sface_retains_existing_cosine_policy_and_reference_cap(monkeypatch):
    maximum = min(verifier.REFERENCE_MAX_DISTANCE, engine._purpose_threshold("login", "insightface"))
    assert ids._same_face(descriptor(), descriptor(np.arccos(1 - maximum + .0001)))
    assert not ids._same_face(descriptor(), descriptor(np.arccos(1 - maximum - .0001)))
    monkeypatch.setattr(engine, "_purpose_threshold", lambda *args: .2)
    assert not ids._same_face(descriptor(), descriptor(np.arccos(.7)))
    monkeypatch.setattr(engine, "_purpose_threshold", lambda *args: .9)
    assert not ids._same_face(descriptor(), descriptor(np.arccos(.3)))  # Reference cap is stricter.


@pytest.mark.parametrize("value", [float("nan"), float("inf"), 0, -1])
def test_invalid_policy_cannot_authorize_a_face_match(monkeypatch, value):
    monkeypatch.setattr(engine, "_purpose_threshold", lambda *args: value)
    assert not ids._same_face(descriptor(), descriptor())


@pytest.mark.parametrize("change", ["none", "multiple", "nonfinite", "low_confidence", "other_person", "outside", "collapsed_eyes"])
def test_uncertain_or_different_detected_face_cannot_be_substituted(change):
    row = detection()
    if change == "none": row = None
    elif change == "multiple": row = np.concatenate([row, row])
    elif change == "nonfinite": row[0, 4] = float("nan")
    elif change == "low_confidence": row[0, 14] = .89
    elif change == "other_person": row[0, 0:2] = [260, 260]
    elif change == "outside": row[0, 4] = -1
    else: row[0, 6:8] = row[0, 4:6]
    with pytest.raises(HTTPException) as failure:
        verifier._checked_detection(row, (50, 250, 250, 50), (320, 320, 3), "live camera")
    assert failure.value.status_code == 422


def test_five_landmarks_must_be_bound_to_the_original_detected_face():
    row = detection()
    checked = verifier._checked_detection(row, (50, 250, 250, 50), (320, 320, 3), "ID")
    assert np.array_equal(checked, row[0])


def test_bgr_alignment_and_native_feature_buffer_are_copied():
    calls = []; buffer = np.ones((1, 128), dtype=np.float32)
    detector = SimpleNamespace(setInputSize=lambda size: calls.append(size), detect=lambda bgr: (1, detection()))
    def align(bgr, row):
        calls.append(bgr[0, 0].tolist())
        return np.zeros((112, 112, 3), np.uint8)
    recognizer = SimpleNamespace(alignCrop=align, feature=lambda _: buffer)
    encoder = object.__new__(verifier._PortraitEncoder)
    from threading import Lock
    encoder.lock = Lock(); encoder.detector = detector; encoder.recognizer = recognizer
    result = encoder.encode(np.full((320, 320, 3), [170, 100, 50], np.uint8), (50, 250, 250, 50), "ID")
    buffer[:] = 2
    assert np.array_equal(result, np.ones(128))
    assert calls == [(320, 320), [50, 100, 170]]


def test_close_camera_face_is_normalized_for_detection_but_aligned_at_source_resolution():
    from threading import Lock
    rgb = np.full((907, 733, 3), [170, 100, 50], np.uint8)
    original = np.array([[50, 120, 600, 700, 200, 300, 500, 300, 350, 480, 240, 650, 460, 650, .99]], dtype=np.float32)
    calls = []
    def detect(bgr):
        calls.append(bgr.shape)
        assert bgr.shape[:2] == (288, 224)  # Aspect-preserving resize, then stride padding.
        assert bgr[0, 0].tolist() == [50, 100, 170]
        assert not bgr[259:, :].any() and not bgr[:, 209:].any()
        row = original.copy()
        row[:, [0, 2, 4, 6, 8, 10, 12]] *= 209 / 733
        row[:, [1, 3, 5, 7, 9, 11, 13]] *= 259 / 907
        assert max(row[0, 2:4]) <= 201
        return 1, row
    def align(bgr, row):
        assert bgr.shape == rgb.shape
        np.testing.assert_allclose(row, original[0], rtol=0, atol=.0001)
        calls.append("aligned-original")
        return np.zeros((112, 112, 3), np.uint8)
    encoder = object.__new__(verifier._PortraitEncoder)
    encoder.lock = Lock()
    encoder.detector = SimpleNamespace(setInputSize=lambda size: calls.append(size), detect=detect)
    encoder.recognizer = SimpleNamespace(alignCrop=align, feature=lambda _: np.ones((1, 128)))
    before = rgb.copy()
    assert encoder.encode(rgb, (120, 650, 820, 50), "live camera").shape == (128,)
    assert calls == [(224, 288), (288, 224, 3), "aligned-original"]
    assert np.array_equal(rgb, before)


@pytest.mark.parametrize("change,reason", [("none", "not_found"), ("multiple", "multiple_faces"),
    ("different", "different_face"), ("outside", "invalid_landmarks")])
def test_normalized_detection_still_rejects_ambiguous_or_unbound_faces(change, reason):
    from threading import Lock
    row = detection()
    if change == "none": row = None
    elif change == "multiple": row = np.concatenate([row, row])
    elif change == "different": row[0, :2] = [260, 260]
    else: row[0, 4] = 321
    encoder = object.__new__(verifier._PortraitEncoder)
    encoder.lock = Lock()
    encoder.detector = SimpleNamespace(setInputSize=lambda _: None, detect=lambda _: (1, row))
    def forbidden(*args): pytest.fail("An uncertain face cannot reach the recognizer")
    encoder.recognizer = SimpleNamespace(alignCrop=forbidden, feature=forbidden)
    with pytest.raises(verifier.PortraitDetectionError) as failure:
        encoder.encode(np.zeros((320, 320, 3), np.uint8), (50, 250, 250, 50), "live camera")
    assert failure.value.status_code == 422 and failure.value.reason == reason


def test_stride_padding_cannot_make_an_outside_landmark_valid():
    from threading import Lock
    row = detection(); row[0, 4] = 300  # In the padded image, outside the original 289px width.
    encoder = object.__new__(verifier._PortraitEncoder)
    encoder.lock = Lock()
    def detect(bgr):
        assert bgr.shape == (320, 320, 3)
        return 1, row
    encoder.detector = SimpleNamespace(setInputSize=lambda _: None, detect=detect)
    with pytest.raises(verifier.PortraitDetectionError) as failure:
        encoder.encode(np.zeros((317, 289, 3), np.uint8), (50, 250, 250, 50), "ID")
    assert failure.value.reason == "invalid_landmarks"


@pytest.mark.parametrize("values", [np.zeros((1, 128)), np.ones((1, 127)), np.full((1, 128), float("nan"))])
def test_invalid_features_fail_closed(values):
    encoder = object.__new__(verifier._PortraitEncoder)
    from threading import Lock
    encoder.lock = Lock()
    encoder.detector = SimpleNamespace(setInputSize=lambda _: None, detect=lambda _: (1, detection()))
    encoder.recognizer = SimpleNamespace(alignCrop=lambda *a: np.zeros((112, 112, 3), np.uint8), feature=lambda _: values)
    with pytest.raises(RuntimeError):
        encoder.encode(np.zeros((320, 320, 3), np.uint8), (50, 250, 250, 50), "ID")


def test_models_are_reused_only_inside_one_request_then_released(monkeypatch):
    instances = []
    class SyntheticEncoder:
        def __init__(self): instances.append(self)
        def encode(self, *args): return np.ones(128)
    monkeypatch.setattr(verifier, "_PortraitEncoder", SyntheticEncoder)
    for count in (1, 2):
        with frame_scope() as state:
            assert verifier._encoder() is verifier._encoder()
            assert len(instances) == count
        assert not state.models


def test_corrupt_or_unavailable_models_cannot_fall_back_to_a_pass(monkeypatch):
    monkeypatch.setattr(verifier, "MODEL_HASHES", {"missing-synthetic-model.onnx": "0" * 64})
    assert not verifier.model_assets_valid()
    with pytest.raises(HTTPException) as failure:
        verifier.encode_portrait(np.zeros((320, 320, 3), np.uint8), (50, 250, 250, 50), "ID")
    assert failure.value.status_code == 503
    assert "missing-synthetic" not in failure.value.detail


def test_new_comparator_is_used_for_the_previously_detected_portrait(monkeypatch):
    calls = []
    monkeypatch.setattr(portraits, "decode_rgb", lambda frame: np.full((600, 900, 3), [170, 100, 50], np.uint8))
    monkeypatch.setattr(verifier, "encode_portrait", lambda rgb, box, label: (calls.append((rgb.shape, box, label)), np.ones(128))[1])
    detected = {"face_box": {"top": .2, "left": .3, "width": .3, "height": .4}}
    result = portraits.comparison_face("synthetic-frame", detected, engine_name="sface", label="uploaded ID")
    assert result["engine"] == "sface" and len(result["encoding"]) == 128
    assert len(calls) == 1 and calls[0][2] == "uploaded ID"


def test_bundled_native_models_load_without_network_and_reject_blank_pixels(monkeypatch, tmp_path):
    def no_network(*args): pytest.fail("Verification cannot send images or download models")
    monkeypatch.setattr("socket.socket.connect", no_network)
    make_file = verifier.NamedTemporaryFile
    monkeypatch.setattr(verifier, "NamedTemporaryFile", lambda **kwargs: make_file(dir=tmp_path, **kwargs))
    before = set(tmp_path.rglob("*"))
    with frame_scope() as state:
        encoder = verifier._encoder()
        aligned = encoder.recognizer.alignCrop(np.zeros((320, 320, 3), np.uint8), detection()[0])
        assert aligned.shape == (112, 112, 3)
        features = encoder.recognizer.feature(aligned).copy()
        assert features.shape == (1, 128) and np.isfinite(features).all()
        with pytest.raises(HTTPException) as failure:
            verifier.encode_portrait(np.zeros((317, 289, 3), np.uint8), (50, 230, 250, 50), "synthetic ID")
        assert failure.value.status_code == 422
    assert not state.models and not state.source
    assert set(tmp_path.rglob("*")) == before


def test_model_file_is_removed_even_when_native_loading_fails(monkeypatch, tmp_path):
    import cv2
    before = set(tmp_path.rglob("*"))
    make_file = verifier.NamedTemporaryFile
    monkeypatch.setattr(verifier, "NamedTemporaryFile", lambda **kwargs: make_file(dir=tmp_path, **kwargs))
    def fail(*args): raise RuntimeError("synthetic native loading failure")
    monkeypatch.setattr(cv2, "FaceRecognizerSF_create", fail)
    with pytest.raises(HTTPException) as failure:
        verifier.encode_portrait(np.zeros((320, 320, 3), np.uint8), (50, 250, 250, 50), "ID")
    assert failure.value.status_code == 503
    assert set(tmp_path.rglob("*")) == before


def test_unpacked_model_hash_is_required_before_native_loading(monkeypatch, tmp_path):
    before = set(tmp_path.rglob("*"))
    monkeypatch.setattr(verifier.gzip, "decompress", lambda packed: b"synthetic corrupted model")
    with pytest.raises(HTTPException) as failure:
        verifier.encode_portrait(np.zeros((320, 320, 3), np.uint8), (50, 250, 250, 50), "ID")
    assert failure.value.status_code == 503
    assert set(tmp_path.rglob("*")) == before


def test_health_reports_bundled_model_integrity_without_patron_data(client):
    result = client.get("/health")
    assert result.status_code == 200
    assert result.json()["id_face_comparison"] == {"engine": "sface", "model_assets_valid": True}
    assert not any(value in result.text for value in ("base64", "encoding", "uploads/ids", "MODEL_ROOT"))
