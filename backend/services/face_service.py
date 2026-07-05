"""
Face recognition service.

Flow:
  encode_face(image_bytes) -> list[float] or None for single-person scans
  detect_face_encodings(image_bytes) -> per-face encoding and normalized box
  compare(encoding, stored_encoding_json) -> distance
  find_match(encoding, users) -> User or None
"""
import base64
import json
from typing import Optional

import numpy as np

from config import FACE_MATCH_THRESHOLD

# Lazy-import face_recognition so the rest of the app still starts
# even if dlib isn't installed yet.
try:
    import face_recognition
    FACE_LIB_AVAILABLE = True
except ImportError:
    FACE_LIB_AVAILABLE = False


def _decode_base64_image(b64_string: str) -> np.ndarray:
    """Convert a base64 JPEG/PNG string into a numpy RGB array."""
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    img_bytes = base64.b64decode(b64_string)

    from PIL import Image
    import io

    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return np.array(img)


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def normalize_face_box(location: tuple[int, int, int, int], image_shape) -> dict:
    """
    Convert a face_recognition location tuple into normalized face-only bounds.

    face_recognition returns (top, right, bottom, left) in image pixels.
    """
    img_height, img_width = image_shape[:2]
    top, right, bottom, left = location

    left_n = _clamp(left / img_width)
    top_n = _clamp(top / img_height)
    right_n = _clamp(right / img_width)
    bottom_n = _clamp(bottom / img_height)
    width_n = _clamp(right_n - left_n, 0.0, 1.0 - left_n)
    height_n = _clamp(bottom_n - top_n, 0.0, 1.0 - top_n)

    return {
        "top": round(top_n, 6),
        "left": round(left_n, 6),
        "width": round(width_n, 6),
        "height": round(height_n, 6),
    }


def detect_face_encodings(b64_image: str, max_faces: int = 4) -> list[dict]:
    """
    Return one encoding and tight normalized face box per detected face.
    Limited to max_faces so walk-through kiosk scans remain bounded.
    """
    if not FACE_LIB_AVAILABLE:
        raise RuntimeError(
            "face_recognition library is not installed. "
            "Install dlib + face_recognition to enable biometric features."
        )

    img_array = _decode_base64_image(b64_image)
    locations = face_recognition.face_locations(img_array)[:max_faces]
    if not locations:
        return []

    encodings = face_recognition.face_encodings(img_array, known_face_locations=locations)
    results = []
    for location, encoding in zip(locations, encodings):
        results.append(
            {
                "encoding": encoding.tolist(),
                "face_box": normalize_face_box(location, img_array.shape),
            }
        )
    return results


def encode_face(b64_image: str) -> Optional[list]:
    """
    Given a base64 webcam frame, return the 128-float face encoding.
    Returns None for no face or multiple faces.
    """
    faces = detect_face_encodings(b64_image, max_faces=2)
    if len(faces) != 1:
        return None
    return faces[0]["encoding"]


def match_face(live_encoding: list, stored_json: str) -> float:
    """
    Compare a live encoding against a stored JSON encoding string.
    Returns the Euclidean distance (lower = more similar).
    """
    stored = np.array(json.loads(stored_json))
    live = np.array(live_encoding)
    return float(np.linalg.norm(live - stored))


def find_match(live_encoding: list, users: list, threshold: float = FACE_MATCH_THRESHOLD):
    """
    Return the closest matching User below threshold, or None.

    Pass a lower threshold for stricter duplicate detection during enrollment.
    """
    best_user = None
    best_distance = threshold

    for user in users:
        if not user.face_encoding:
            continue
        try:
            dist = match_face(live_encoding, user.face_encoding)
            if dist < best_distance:
                best_distance = dist
                best_user = user
        except Exception:
            continue

    return best_user
