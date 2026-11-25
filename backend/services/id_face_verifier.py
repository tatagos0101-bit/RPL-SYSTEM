"""Local, request-scoped SFace encoding for ID-to-live portrait comparisons.

The detector is bound to the face already checked by the enrollment pipeline.
Models are bundled/checksummed; no network calls or persistent patron artifacts.
"""
import gzip
import hashlib
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock

from fastapi import HTTPException
import numpy as np

from services.face_frame import current_frame

MODEL_ROOT = Path(__file__).resolve().parents[1] / "assets" / "identity_face"
MODEL_HASHES = {
    "face_recognition_sface_2021dec_int8.onnx.gz": "9320d3038fbd57f97daf65ac7d2e45cb0618f255b02021de3bb4b5732db885ed",
    "face_detection_yunet_2023mar.onnx": "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
}
SFACE_RAW_SHA256 = "2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a"
# OpenCV's published SFace baseline. The existing cosine policy can be stricter.
REFERENCE_MAX_DISTANCE = 1.0 - .363
_CONTEXT_KEY = ("id_portrait_encoder", "sface_2021dec_int8")


def model_assets_valid():
    """Readiness metadata only; no patron inputs or native model inference."""
    try:
        return all(hashlib.sha256((MODEL_ROOT / name).read_bytes()).hexdigest() == expected
            for name, expected in MODEL_HASHES.items())
    except OSError:
        return False


def _checked_detection(rows, location, image_shape, label):
    if rows is None or np.asarray(rows).shape != (1, 15):
        raise HTTPException(422, f"The {label} portrait needs one clear face for comparison. Retake the photo without glare or face coverings.")
    row = np.asarray(rows[0], dtype=np.float32)
    top, right, bottom, left = location
    height, width = image_shape[:2]
    x, y, w, h = [float(value) for value in row[:4]]
    if (not np.isfinite(row).all() or row[14] < .9 or min(w, h) <= 0
            or not left <= x + w / 2 <= right or not top <= y + h / 2 <= bottom):
        raise HTTPException(422, f"The {label} portrait could not be read clearly. Retake a sharp, straight-on photo.")
    intersection = max(0, min(right, x + w) - max(left, x)) * max(0, min(bottom, y + h) - max(top, y))
    union = (right - left) * (bottom - top) + w * h - intersection
    points = row[4:14].reshape(5, 2)
    if (union <= 0 or intersection / union < .3
            or (points[:, 0] < 0).any() or (points[:, 0] >= width).any()
            or (points[:, 1] < 0).any() or (points[:, 1] >= height).any()
            or np.linalg.norm(points[0] - points[1]) < 4):
        raise HTTPException(422, f"The {label} portrait could not be aligned with the detected face. Retake the photo.")
    return row


class _PortraitEncoder:
    def __init__(self):
        import cv2
        if not model_assets_valid():
            raise RuntimeError("Portrait model checksum mismatch")
        self.lock = Lock()
        raw = gzip.decompress((MODEL_ROOT / "face_recognition_sface_2021dec_int8.onnx.gz").read_bytes())
        if len(raw) != 9_896_933 or hashlib.sha256(raw).hexdigest() != SFACE_RAW_SHA256:
            raise RuntimeError("Unpacked portrait model checksum mismatch")
        # OpenCV 4.10's FaceRecognizerSF accepts a path, not an ONNX buffer.
        # Only public model weights touch this temporary file, never patron data.
        temporary_model = None
        try:
            with NamedTemporaryFile(mode="wb", prefix="rpl-sface-", suffix=".onnx", delete=False) as output:
                temporary_model = Path(output.name)
                output.write(raw)
            self.recognizer = cv2.FaceRecognizerSF_create(str(temporary_model), "",
                cv2.dnn.DNN_BACKEND_OPENCV, cv2.dnn.DNN_TARGET_CPU)
        finally:
            if temporary_model is not None:
                temporary_model.unlink(missing_ok=True)
        self.detector = cv2.FaceDetectorYN_create(str(MODEL_ROOT / "face_detection_yunet_2023mar.onnx"), "",
            (320, 320), .9, .3, 5000, cv2.dnn.DNN_BACKEND_OPENCV, cv2.dnn.DNN_TARGET_CPU)

    def encode(self, rgb, location, label):
        # OpenCV's native alignment/recognition API expects BGR input.
        bgr = np.ascontiguousarray(rgb[:, :, ::-1])
        with self.lock:
            self.detector.setInputSize((bgr.shape[1], bgr.shape[0]))
            _, rows = self.detector.detect(bgr)
            row = _checked_detection(rows, location, bgr.shape, label)
            aligned = self.recognizer.alignCrop(bgr, row)
            # Native output buffers can be reused by the next inference.
            vector = np.asarray(self.recognizer.feature(aligned), dtype=float).reshape(-1).copy()
        if vector.shape != (128,) or not np.isfinite(vector).all() or np.linalg.norm(vector) == 0:
            raise RuntimeError("Unusable portrait descriptor")
        return vector


def _encoder():
    state = current_frame()
    if state is None:
        return _PortraitEncoder()
    if _CONTEXT_KEY not in state.models:
        state.models[_CONTEXT_KEY] = _PortraitEncoder()
    return state.models[_CONTEXT_KEY]


def encode_portrait(rgb, location, label):
    try:
        return _encoder().encode(rgb, location, label)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "The ID-to-face comparison service is temporarily unavailable. Try again or ask the librarian for assisted enrollment.") from None
