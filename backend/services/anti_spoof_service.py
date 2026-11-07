"""MiniFASNet presentation-attack detection; no runtime model downloads.

Preprocessing follows Minivision's Silent-Face-Anti-Spoofing (Apache-2.0).
This screens camera frames for printed/screen presentations, not camera origin
or arbitrary replay/injection. See assets/anti_spoof/README.md for limitations.
"""
from functools import lru_cache
import hashlib
from pathlib import Path
from threading import Lock

import cv2
import numpy as np


MODEL_DIR = Path(__file__).resolve().parents[1] / "assets" / "anti_spoof"
MODEL_SPECS = (
    ("2.7_80x80_MiniFASNetV2.onnx", 2.7,
     "b813eb6dac6b7f597063ce1c62a8d6be87ccc6f48acc8c5e3216d2b46d82ae6d"),
    ("4_0_0_80x80_MiniFASNetV1SE.onnx", 4.0,
     "a29cba82797e6717b8178d326ca4d34bcf1cf8c57cc0806c9567850d79b76068"),
)
# Conservative starting operating point, not a calibrated probability.
LIVE_THRESHOLD = 0.90
SPOOF_THRESHOLD = 0.50
MIN_FACE_PIXELS = 80
_INFERENCE_LOCK = Lock()  # OpenCV Net.setInput/forward share mutable state.


class AntiSpoofUnavailable(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _load_models():
    models = []
    try:
        for filename, scale, expected_hash in MODEL_SPECS:
            path = MODEL_DIR / filename
            if hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
                raise AntiSpoofUnavailable("Anti-spoof model checksum mismatch")
            models.append((scale, cv2.dnn.readNetFromONNX(str(path))))
    except (OSError, cv2.error) as exc:
        raise AntiSpoofUnavailable("Anti-spoof models could not be loaded") from exc
    return tuple(models)


def _crop(image, box, scale):
    """Context-preserving crop equivalent to upstream CropImage._get_new_box.

    Keep the BGR byte range (0..255); do NOT divide by 255 or swap to RGB.
    """
    height, width = image.shape[:2]
    x, y, box_width, box_height = box
    scale = min((height - 1) / box_height, (width - 1) / box_width, scale)
    crop_width, crop_height = box_width * scale, box_height * scale
    center_x, center_y = x + box_width / 2, y + box_height / 2
    left, top = center_x - crop_width / 2, center_y - crop_height / 2
    right, bottom = center_x + crop_width / 2, center_y + crop_height / 2
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > width - 1:
        left -= right - width + 1
        right = width - 1
    if bottom > height - 1:
        top -= bottom - height + 1
        bottom = height - 1
    patch = image[int(top):int(bottom) + 1, int(left):int(right) + 1]
    return cv2.resize(patch, (80, 80), interpolation=cv2.INTER_LINEAR)


def score_face(image, box):
    """Return (hint, live score) for this exact detected face, failing closed."""
    height, width = image.shape[:2]
    values = np.asarray(box, dtype=float)
    if values.shape != (4,) or not np.isfinite(values).all():
        return "retry", 0.0
    x, y, face_width, face_height = values
    if x < 0 or y < 0 or x + face_width > width + 1 or y + face_height > height + 1:
        return "retry", 0.0
    if min(face_width, face_height) < MIN_FACE_PIXELS:
        return "too_far", 0.0
    roi = image[int(y):int(y + face_height), int(x):int(x + face_width)]
    if roi.size == 0:
        return "retry", 0.0
    if float(cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY).mean()) < 50:
        return "too_dark", 0.0
    predictions = []
    try:
        with _INFERENCE_LOCK:
            for scale, model in _load_models():
                patch = _crop(image, values, scale)
                model.setInput(cv2.dnn.blobFromImage(patch, 1.0, swapRB=False))
                logits = model.forward().reshape(-1)
                if logits.shape != (3,) or not np.isfinite(logits).all():
                    raise AntiSpoofUnavailable("Invalid anti-spoof model output")
                probabilities = np.exp(logits - logits.max())
                probabilities /= probabilities.sum()
                predictions.append(probabilities)
    except cv2.error as exc:
        raise AntiSpoofUnavailable("Anti-spoof inference failed") from exc
    score = float(np.mean(predictions, axis=0)[1])  # upstream class 1 = live
    if score >= LIVE_THRESHOLD and all(int(np.argmax(p)) == 1 for p in predictions):
        return "ok", score
    if score < SPOOF_THRESHOLD:
        return "spoof", score
    return "liveness_uncertain", score


def check_detected_faces_liveness(image_b64, faces):
    """Check ALL recognition boxes before any identity/access side effects.

    The Haar precheck alone cannot protect a face it missed in a group frame.
    Reject the entire mixed/uncertain frame rather than approve unverified faces.
    """
    from services.liveness_service import _decode_base64_image

    try:
        image = _decode_base64_image(image_b64)
        height, width = image.shape[:2]
        if not faces:
            return "retry", 0.0
        scores = []
        for face in faces:
            box = face.get("face_box") or {}
            hint, score = score_face(image, (
                float(box["left"]) * width, float(box["top"]) * height,
                float(box["width"]) * width, float(box["height"]) * height,
            ))
            if hint != "ok":
                return hint, score
            scores.append(score)
        return "ok", min(scores)
    except AntiSpoofUnavailable:
        return "unavailable", 0.0
    except (ValueError, TypeError, KeyError, OSError):
        return "retry", 0.0
