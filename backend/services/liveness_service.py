"""
Liveness detection service for anti-spoofing.

Screens frame quality, then applies trained photo/screen presentation detection.
Recognition routes also verify every exact recognition box before granting access.
"""
import cv2
import numpy as np
from typing import Tuple
from threading import local
from services.face_frame import decode_bgr, timed_stage

_detectors = local()


def _face_cascade():
    if not hasattr(_detectors, "cascade"):
        _detectors.cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    return _detectors.cascade


def _decode_base64_image(b64_string: str) -> np.ndarray:
    """Convert a base64 JPEG/PNG string to a numpy array."""
    return decode_bgr(b64_string)


@timed_stage("precheck")
def check_liveness(b64_image: str) -> Tuple[str, float]:
    """
    Check quality and MiniFASNet scores for all faces found by the precheck.
    
    Returns:
        (hint, probability)
        - hint: ok/spoof/retry/too_dark/too_far/liveness_uncertain/unavailable
        - score: model live score (not a calibrated probability)
    """
    try:
        img = _decode_base64_image(b64_image)
    except Exception:
        return ("retry", 0.0)
    
    # Check image brightness
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    brightness = np.mean(gray)
    
    if brightness < 50:
        return ("too_dark", 0.0)
    
    from services.anti_spoof_service import AntiSpoofUnavailable, score_face

    # Early face/quality check; recognition boxes are independently screened too.
    face_cascade = _face_cascade()
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)
    
    if len(faces) == 0:
        return ("retry", 0.0)
    
    scores = []
    try:
        for box in faces:
            hint, score = score_face(img, box)
            if hint != "ok":
                return hint, score
            scores.append(score)
    except AntiSpoofUnavailable:
        return "unavailable", 0.0
    return "ok", min(scores)


def liveness_failure_message(hint: str) -> str:
    """Only 'ok' authorizes continuation; unknown/failed checks fail closed."""
    from fastapi import HTTPException

    if hint == "unavailable":
        raise HTTPException(status_code=503, detail="Face anti-spoofing is temporarily unavailable. Use password login or ask the librarian for assistance.")
    return {
        "retry": "no_face", "too_dark": "too_dark", "too_far": "too_far",
        "spoof": "Spoofing Detected",
    }.get(hint, "liveness_uncertain")


def require_live_enrollment(image: str, faces: list) -> None:
    from fastapi import HTTPException
    from services.anti_spoof_service import check_detected_faces_liveness

    hint, _score = check_detected_faces_liveness(image, faces)
    if hint == "ok":
        return
    liveness_failure_message(hint)  # raises 503 for unavailable inference
    messages = {
        "too_dark": "The face is too dark. Improve the lighting and try again.",
        "too_far": "Move closer to the camera and try again.",
    }
    raise HTTPException(status_code=422, detail=messages.get(
        hint, "Could not verify a live face. Use the camera directly, without a photo or screen."
    ))
