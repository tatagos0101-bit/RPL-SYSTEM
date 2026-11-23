from types import SimpleNamespace
import numpy as np
import pytest
from services import entry_face_detector as detector, liveness_service, anti_spoof_service
from services.face_frame import frame_scope


def test_native_coordinates_are_cached_only_within_exact_frame(monkeypatch):
    pixels = np.zeros((1080, 1920, 3), dtype=np.uint8)
    calls = []
    fake = SimpleNamespace(setInputSize=lambda size: calls.append(size), detect=lambda image: (None, np.array([[100, 50, 40, 60, .99]])))
    monkeypatch.setattr(detector, '_detector', lambda: fake)
    monkeypatch.setattr(detector, 'decode_bgr', lambda image: pixels)
    with frame_scope() as state:
        state.entrance = True
        assert detector.entry_face_locations('synthetic') == [(100, 280, 220, 200)]
        assert detector.entry_face_locations('synthetic') == [(100, 280, 220, 200)]
        assert calls == [(960, 540)]
        assert state.min_face_pixels == 80
    assert not state.detections and state.min_face_pixels is None


def test_missing_or_corrupt_detector_fails_closed(monkeypatch, tmp_path):
    path = tmp_path / 'missing.onnx'
    monkeypatch.setattr(detector, 'MODEL_PATH', path)
    detector._detector.cache_clear()
    with pytest.raises(detector.EntryDetectorUnavailable):
        detector._detector()
    path.write_bytes(b'synthetic-corrupt-model')
    with pytest.raises(detector.EntryDetectorUnavailable):
        detector._detector()
    detector._detector.cache_clear()


def test_entry_precheck_preserves_small_face_and_mixed_frame_rejection(monkeypatch):
    monkeypatch.setattr(liveness_service, '_decode_base64_image', lambda image: np.full((480, 640, 3), 150, np.uint8))
    monkeypatch.setattr(detector, 'entry_face_locations', lambda image: [(20, 120, 120, 20), (30, 260, 130, 160)])
    scores = iter([('ok', .99), ('spoof', .01)])
    monkeypatch.setattr(anti_spoof_service, 'score_face', lambda *args: next(scores))
    with frame_scope() as state:
        state.entrance = True
        assert liveness_service.check_liveness('synthetic') == ('spoof', .01)
    monkeypatch.setattr(anti_spoof_service, 'score_face', lambda *args: ('too_far', 0))
    with frame_scope() as state:
        state.entrance = True
        assert liveness_service.check_liveness('synthetic')[0] == 'too_far'
