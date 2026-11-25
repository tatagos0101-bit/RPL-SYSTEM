"""Request-local portrait alignment for online ID comparison only.

Do not change sign-in templates, matching thresholds or live PAD inputs here.
Reuses the installed models. No image, descriptor or diagnostic file is retained.
"""
import math

from fastapi import HTTPException
import numpy as np
from PIL import Image

from services.face_frame import decode_rgb

COMPARISON_PREPROCESSING = "face_scale_160_lanczos_v1"


def _portrait_crop(rgb: np.ndarray, box: dict | None, label: str):
    try:
        top, left, width, height = [float(box[key]) for key in ("top", "left", "width", "height")]
        if (not all(math.isfinite(value) for value in (top, left, width, height))
                or min(top, left) < 0 or min(width, height) <= 0
                or top + height > 1.00001 or left + width > 1.00001):
            raise ValueError("Invalid portrait bounds")
    except (KeyError, TypeError, ValueError):
        raise HTTPException(422, f"The {label} portrait could not be aligned. Retake a clear, straight-on photo.") from None
    image_height, image_width = rgb.shape[:2]
    x, y, w, h = left * image_width, top * image_height, width * image_width, height * image_height
    # Upscaling cannot restore a tiny printed portrait's missing detail.
    if min(w, h) < 64:
        raise HTTPException(422, f"The {label} portrait is too small to compare reliably. Use a closer, higher-resolution photo. If this is the saved library ID, ask the librarian to review it.")
    x0, y0 = max(0, math.floor(x - w * .35)), max(0, math.floor(y - h * .35))
    x1, y1 = min(image_width, math.ceil(x + w * 1.35)), min(image_height, math.ceil(y + h * 1.35))
    crop = Image.fromarray(rgb[y0:y1, x0:x1])
    # ID portraits and close camera faces must reach the recognizer at one
    # scale. Native SFace alignCrop uses bilinear warping to 112px, which
    # does not antialias a much larger camera portrait. Lanczos resampling
    # here handles downscaling before the same landmark/alignment pipeline.
    scale = min(160 / min(w, h), 1024 / max(crop.size))
    original_width, original_height = crop.size
    crop = crop.resize((max(1, round(original_width * scale)), max(1, round(original_height * scale))), Image.Resampling.LANCZOS)
    scale_x, scale_y = crop.width / original_width, crop.height / original_height
    location = (round((y - y0) * scale_y), round((x + w - x0) * scale_x),
        round((y + h - y0) * scale_y), round((x - x0) * scale_x))
    return np.ascontiguousarray(crop), location


def comparison_face(frame: str, detected: dict, *, engine_name: str, label: str) -> dict:
    """Encode the same detected portrait consistently, without choosing a new person."""
    from services import face_engine_service as engine
    try:
        rgb = decode_rgb(frame)
        crop, location = _portrait_crop(rgb, detected.get("face_box"), label)
        if engine_name == "sface":
            from services.id_face_verifier import encode_portrait
            vector = encode_portrait(crop, location, label)
            dimension = 128
        elif engine_name == "dlib":
            from services import face_service
            if not face_service.FACE_LIB_AVAILABLE:
                raise RuntimeError("Portrait encoder unavailable")
            # Five-point alignment and the existing 128D model; bounded
            # averaging stabilizes one-off photo/print resampling differences.
            encodings = face_service.face_recognition.face_encodings(crop,
                known_face_locations=[location], num_jitters=3, model="small")
            if len(encodings) != 1:
                raise HTTPException(422, f"The {label} portrait could not be encoded clearly. Retake the photo.")
            vector = np.asarray(encodings[0], dtype=float)
            dimension = 128
        elif engine_name == "insightface":
            app = engine._get_insightface_app()
            if app is None:
                raise RuntimeError("Portrait encoder unavailable")
            # InsightFace expects OpenCV BGR; dlib expects RGB. Do not compare
            # a color-swapped descriptor with a differently processed reference.
            faces = list(app.get(np.ascontiguousarray(crop[:, :, ::-1])))
            if len(faces) != 1:
                raise HTTPException(422, f"The {label} portrait could not be aligned clearly. Retake the photo.")
            vector = getattr(faces[0], "normed_embedding", None)
            if vector is None:
                vector = getattr(faces[0], "embedding", None)
            vector = np.asarray(vector, dtype=float)
            dimension = 512
        else:
            raise RuntimeError("Unsupported portrait encoder")
        if vector.shape != (dimension,) or not np.isfinite(vector).all() or np.linalg.norm(vector) == 0:
            raise RuntimeError("Unusable portrait descriptor")
        return {"engine": engine_name, "encoding": vector.tolist()}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Portrait comparison is temporarily unavailable. Try again or ask the librarian for assisted enrollment.") from None


def portrait_quality(frame: str, detected: dict) -> dict:
    """Numeric troubleshooting metadata only; never return a crop or descriptor."""
    try:
        import cv2
        rgb = decode_rgb(frame)
        box = detected["face_box"]
        height, width = rgb.shape[:2]
        left, top = round(box["left"] * width), round(box["top"] * height)
        right = min(width, round((box["left"] + box["width"]) * width))
        bottom = min(height, round((box["top"] + box["height"]) * height))
        crop = np.ascontiguousarray(rgb[max(0, top):bottom, max(0, left):right])
        gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
        return {"width_px": int(crop.shape[1]), "height_px": int(crop.shape[0]),
            "brightness": round(float(gray.mean()), 2), "contrast": round(float(gray.std()), 2),
            "sharpness": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2)}
    except Exception:
        return {}  # Diagnostics must never replace the actual verification outcome.
