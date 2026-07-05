import os

from fastapi import HTTPException

JPEG_EXTS = {".jpg", ".jpeg"}
IMAGE_EXTS = JPEG_EXTS | {".png", ".webp"}
ID_EXTS = IMAGE_EXTS | {".pdf"}


def detect_file_ext(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    if content.startswith(b"%PDF-"):
        return ".pdf"
    return None


def validate_upload_bytes(
    *,
    content: bytes,
    filename: str | None,
    allowed_exts: set[str],
    max_bytes: int,
    human_label: str,
) -> str:
    if not content:
        raise HTTPException(status_code=400, detail=f"{human_label} file is empty.")
    if len(content) > max_bytes:
        size_mb = max_bytes // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"{human_label} must be under {size_mb} MB.")

    claimed_ext = os.path.splitext(filename or "")[-1].lower()
    if claimed_ext and claimed_ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=_format_allowed_message(human_label, allowed_exts))

    detected_ext = detect_file_ext(content)
    if detected_ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=_format_allowed_message(human_label, allowed_exts))

    if claimed_ext and not _extensions_match(claimed_ext, detected_ext):
        raise HTTPException(status_code=400, detail=_format_allowed_message(human_label, allowed_exts))

    return ".jpg" if detected_ext in JPEG_EXTS else detected_ext


def _extensions_match(claimed_ext: str, detected_ext: str | None) -> bool:
    if detected_ext == ".jpg":
        return claimed_ext in JPEG_EXTS
    return claimed_ext == detected_ext


def _format_allowed_message(human_label: str, allowed_exts: set[str]) -> str:
    ordered = []
    if JPEG_EXTS & allowed_exts:
        ordered.append("JPG")
    for ext in (".png", ".webp", ".pdf"):
        if ext in allowed_exts:
            ordered.append(ext.upper().lstrip("."))

    formats = ordered[0] if len(ordered) == 1 else ", ".join(ordered[:-1]) + f", or {ordered[-1]}"
    return f"{human_label} must be a valid {formats} file."
