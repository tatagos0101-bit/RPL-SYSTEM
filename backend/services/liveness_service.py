"""
Liveness detection service for anti-spoofing.

Detects whether a face in an image is real (live) or spoofed (photo, video, etc).
Returns hints for the gate: "ok", "spoof", "retry", "too_dark", "too_far"
"""
import cv2
import numpy as np
from typing import Tuple
import base64
import io
from PIL import Image


def _decode_base64_image(b64_string: str) -> np.ndarray:
    """Convert a base64 JPEG/PNG string to a numpy array."""
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    
    img_bytes = base64.b64decode(b64_string)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def check_liveness(b64_image: str) -> Tuple[str, float]:
    """
    Check if face in image is real (live) or spoofed.
    
    Returns:
        (hint, probability)
        - hint: "ok", "spoof", "retry", "too_dark", "too_far"
        - probability: confidence score (0-1, higher = more confident in classification)
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
    
    # Check face size using Haar Cascade
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)
    
    if len(faces) == 0:
        return ("retry", 0.0)
    
    # Check if face is too small (too far)
    face_area = faces[0][2] * faces[0][3]
    image_area = img.shape[0] * img.shape[1]
    
    if face_area < image_area * 0.05:  # Face is less than 5% of image
        return ("too_far", 0.0)
    
    # Basic liveness check: detect high-frequency noise (texture)
    # Real faces have more texture than photos
    x, y, w, h = faces[0]
    face_roi = gray[y:y+h, x:x+w]
    
    # Compute Laplacian variance (measure of texture/detail)
    laplacian = cv2.Laplacian(face_roi, cv2.CV_64F)
    variance = laplacian.var()
    
    # Empirical threshold: photos typically have lower variance
    # Real faces typically have variance > 50
    if variance < 20:
        spoof_prob = 0.8
        return ("spoof", spoof_prob)
    
    # Default: assume it's real
    return ("ok", 0.95)
