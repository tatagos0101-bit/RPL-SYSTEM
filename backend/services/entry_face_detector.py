"""Entrance-only face proposals. Identity and PAD remain separate checks."""
from functools import lru_cache
import hashlib
from pathlib import Path
from threading import Lock

import cv2
import numpy as np

from services.face_frame import current_frame, decode_bgr, timed_stage

MODEL_PATH = Path(__file__).resolve().parents[1] / "assets" / "face_detector" / "face_detection_yunet_2023mar.onnx"
MODEL_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
DETECTION_SCORE = .9
MAX_DETECTION_EDGE = 960
_lock = Lock()


class EntryDetectorUnavailable(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _detector():
    try:
        if hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest() != MODEL_SHA256:
            raise EntryDetectorUnavailable("Entrance detector checksum mismatch")
        return cv2.FaceDetectorYN.create(str(MODEL_PATH), "", (320, 320),
                                        DETECTION_SCORE, .3, 5000)
    except (OSError, cv2.error, AttributeError) as error:
        raise EntryDetectorUnavailable("Entrance detector could not be loaded") from error


def uses_entry_detector():
    state = current_frame()
    return state is not None and state.entrance


@timed_stage("proposal")
def entry_face_locations(image):
    """All detected boxes in original pixels, cached only within this request.

    Precheck screens every proposal before recognition takes its bounded subset.
    A small, uncertain or spoofed face still rejects the complete frame.
    """
    bgr = decode_bgr(image)
    state = current_frame()
    if state is not None and "entry" in state.detections:
        return state.detections["entry"]
    height, width = bgr.shape[:2]
    scale = min(1., MAX_DETECTION_EDGE / max(width, height))
    input_width, input_height = max(1, round(width * scale)), max(1, round(height * scale))
    sample = cv2.resize(bgr, (input_width, input_height), interpolation=cv2.INTER_AREA) if scale < 1 else bgr
    try:
        detector = _detector()
        with _lock:
            detector.setInputSize((input_width, input_height))
            _, proposals = detector.detect(sample)
    except (cv2.error, ValueError, TypeError) as error:
        raise EntryDetectorUnavailable("Entrance face detection failed") from error
    locations = []
    if proposals is not None:
        for proposal in proposals:
            x, y, w, h = [float(value) for value in proposal[:4]]
            if not np.isfinite([x, y, w, h, float(proposal[-1])]).all() or w <= 0 or h <= 0:
                raise EntryDetectorUnavailable("Entrance detector returned invalid geometry")
            if float(proposal[-1]) < DETECTION_SCORE:
                continue
            left = max(0, min(width, round(x * width / input_width)))
            top = max(0, min(height, round(y * height / input_height)))
            right = max(0, min(width, round((x + w) * width / input_width)))
            bottom = max(0, min(height, round((y + h) * height / input_height)))
            if right > left and bottom > top:
                locations.append((top, right, bottom, left))
    if state is not None:
        state.detections["entry"] = locations
        state.min_face_pixels = min((min(right - left, bottom - top) for top, right, bottom, left in locations), default=0)
    return locations
