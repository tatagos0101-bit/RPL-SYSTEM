"""Local ID suitability/OCR and face comparison, not issuer authentication.

Remote comparison images are request-local. Only the librarian-verified original
ID is retained using the existing private-ID storage category.
"""
import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import io
from pathlib import Path
import re
from threading import Lock
import unicodedata

from fastapi import HTTPException
import jwt
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from config import JWT_ALGORITHM, JWT_SECRET_KEY
from timezone_utils import now_ph

ID_CHECK_VERSION = "2026-11-25"
MAX_ID_BYTES = 10 * 1024 * 1024
_ocr = None
_ocr_lock = Lock()
_MODEL_HASHES = {
    "PP-OCRv6_det_small.onnx": "090f04abcd9d9a7498bc4ebf677e4cb9bdce1fe4197ddb7e529f1ef44e1ff94f",
    "PP-OCRv6_rec_small.onnx": "6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884",
    "ch_ppocr_mobile_v2.0_cls_mobile.onnx": "e47acedf663230f8863ff1ab0e64dd2d82b838fceb5957146dab185a89d6215c",
}


@dataclass
class DocumentCheck:
    digest: str
    kind: str
    suggested_name: str | None
    suggested_location: str | None
    face: dict


def _normalize(text: str) -> str:
    value = unicodedata.normalize("NFKD", text)
    value = re.sub(r"[^A-Z0-9 ]", " ", "".join(c for c in value if not unicodedata.combining(c)).upper())
    return " ".join(value.split())


async def checked_id_upload(actor_id, file, ticket, token):
    from services.cloud_uploads import read_upload
    from services.upload_validation import IMAGE_EXTS, validate_upload_bytes
    content, filename, reference = await read_upload(folder="ids", user_id=actor_id, file=file, ticket=ticket)
    extension = validate_upload_bytes(content=content, filename=filename,
        allowed_exts=IMAGE_EXTS, max_bytes=MAX_ID_BYTES, human_label="Photo ID")
    claims = verify_review_token(token, content, actor_id)
    return content, extension, reference, claims


def document_image(content: bytes) -> tuple[np.ndarray, str]:
    """Bound image decoding before allocating pixels; strip metadata in memory."""
    if not content or len(content) > MAX_ID_BYTES:
        raise HTTPException(422, "Upload a clear ID photo under 10 MB.")
    try:
        with Image.open(io.BytesIO(content)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"} or getattr(source, "n_frames", 1) != 1:
                raise ValueError("Unsupported document image")
            if source.width * source.height > 16_000_000 or min(source.size) < 320 or max(source.size) < 600:
                raise ValueError("Document dimensions")
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((1600, 1600))
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=92)
            frame = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
            return np.array(image), frame
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Use a clear JPG, PNG or WEBP photo of the complete ID, with readable text and portrait. PDF and small thumbnails cannot be checked.") from None


def read_id_text(rgb: np.ndarray) -> list[str]:
    """Pinned bundled models only. No external OCR service or runtime download."""
    global _ocr
    try:
        with _ocr_lock:
            if _ocr is None:
                import rapidocr
                from rapidocr import RapidOCR
                root = Path(rapidocr.__file__).parent / "models"
                for filename, expected in _MODEL_HASHES.items():
                    if hashlib.sha256((root / filename).read_bytes()).hexdigest() != expected:
                        raise RuntimeError("OCR model checksum mismatch")
                _ocr = RapidOCR(params={
                    "Global.log_level": "critical", "Global.max_side_len": 1600,
                    "Det.model_path": str(root / "PP-OCRv6_det_small.onnx"),
                    "Rec.model_path": str(root / "PP-OCRv6_rec_small.onnx"),
                    "Cls.model_path": str(root / "ch_ppocr_mobile_v2.0_cls_mobile.onnx"),
                    "Det.limit_side_len": 960, "Det.limit_type": "max",
                    "EngineConfig.onnxruntime.intra_op_num_threads": 2,
                    "EngineConfig.onnxruntime.inter_op_num_threads": 1,
                })
            result = _ocr(rgb[:, :, ::-1].copy())  # RapidOCR expects BGR arrays.
            texts, scores = result.txts, result.scores
            if texts is None or scores is None:
                return []
            return [str(value).strip() for value, score in zip(texts, scores)
                    if float(score) >= 0.65 and str(value).strip()][:100]
    except Exception:
        # No upstream exception text: OCR inputs and private paths must stay private.
        raise HTTPException(503, "ID text checking is temporarily unavailable. Try again or ask the library desk for help.") from None


def classify_document(lines: list[str]) -> str:
    text = " ".join(_normalize(line) for line in lines)
    if re.search(r"\b(SPECIMEN|NOT VALID|FAKE ID|SAMPLE ONLY)\b", text):
        raise HTTPException(422, "This image is marked as a sample or invalid document. Present an original valid photo ID.")
    for index, line in enumerate(lines):
        if not re.search(r"expir|valid\s*(?:until|thru)", line, re.I):
            continue
        dates = re.findall(r"\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2})\b", " ".join(lines[index:index + 2]))
        for value in dates:
            for format_ in ("%Y-%m-%d", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
                try:
                    if datetime.strptime(value, format_).date() < now_ph().date():
                        raise HTTPException(422, "The ID appears to be expired. Present a currently valid photo ID.")
                    break
                except ValueError:
                    continue
    kinds = (
        ("national_id", r"PHILIPPINE IDENTIFICATION|PAMBANSANG (?:PAGKAKAKILANLAN|PAGKAKAKILAN|PAGKILALA)|PHILSYS"),
        ("drivers_license", r"LAND TRANSPORTATION OFFICE|DRIVER.?S? LICENSE|LISENSYA NG PAGMAMANEHO"),
        ("passport", r"PASSPORT|PASAPORTE"),
        ("umid", r"UNIFIED MULTI.?PURPOSE|\bUMID\b"),
        ("prc", r"PROFESSIONAL REGULATION COMMISSION|PROFESSIONAL IDENTIFICATION CARD"),
        ("postal_id", r"POSTAL ID|PHILIPPINE POSTAL CORPORATION"),
        ("sss", r"SOCIAL SECURITY SYSTEM"),
        ("gsis", r"GOVERNMENT SERVICE INSURANCE SYSTEM"),
        ("voters_id", r"COMMISSION ON ELECTIONS|VOTER.?S? IDENTIFICATION"),
        ("senior_citizen", r"SENIOR CITIZEN"),
        ("pwd", r"PERSONS? WITH DISABILIT|PERSONS? WITH DISABILITY"),
    )
    if len(text) < 65 or not re.search(r"\b(NAME|APELYIDO|PANGALAN|SURNAME|HOLDER)\b", text):
        raise HTTPException(422, "This does not look like a readable photo ID. Include the complete ID with its name, issuer and portrait.")
    for kind, pattern in kinds:
        if re.search(pattern, text):
            return kind
    raise HTTPException(422, "The ID type could not be identified. Use a supported Philippine government photo ID, or ask the library desk for help.")


def suggested_fields(lines: list[str]) -> tuple[str | None, str | None]:
    """Conservative label extraction. Suggestions must be reviewed by staff."""
    def value_after(labels):
        for index, line in enumerate(lines):
            for label in labels:
                match = re.match(r"^\s*" + label + r"\s*(?:[:/\-]\s*)?(.*)$", line, re.I)
                if not match:
                    continue
                value = match.group(1).strip()
                if value and not re.fullmatch(r"[A-Z ]{0,2}", value):
                    return value[:120]
                if index + 1 < len(lines) and not re.search(r"date|birth|sex|nationality|name|address|kasarian", lines[index + 1], re.I):
                    return lines[index + 1].strip()[:120]
        return None
    name = value_after([r"full\s+name", r"name(?=\s|:|$)", r"pangalan(?=\s|:|$)"])
    if not name:
        last = value_after([r"(?:last\s+name|surname|apelyido)(?:\s*/\s*(?:last\s+name|surname))?"])
        first = value_after([r"(?:given\s+names?|first\s+name|mga\s+pangalan)(?:\s*/\s*(?:given\s+names?|first\s+name))?"])
        middle = value_after([r"(?:middle\s+name|gitnang\s+apelyido)(?:\s*/\s*middle\s+name)?"])
        name = " ".join(value for value in (first, middle, last) if value) if first and last else None
    location = value_after([r"address(?=\s|:|$)", r"tirahan(?=\s|:|$)"])
    return (name[:120] if name else None), location


def document_face(frame: str) -> dict:
    from services import face_engine_service as engine
    try:
        faces = engine.detect_faces(frame, max_faces=3)
    except RuntimeError:
        raise HTTPException(503, "ID portrait checking is temporarily unavailable.") from None
    if len(faces) != 1:
        raise HTTPException(422, "Use a clear ID front showing one readable main portrait. If the ID has several portraits, ask the librarian for assistance.")
    return faces[0]


def inspect_document(content: bytes) -> DocumentCheck:
    rgb, frame = document_image(content)
    lines = read_id_text(rgb)
    kind = classify_document(lines)
    name, location = suggested_fields(lines)
    return DocumentCheck(hashlib.sha256(content).hexdigest(), kind, name, location, document_face(frame))


def issue_review_token(check: DocumentCheck, librarian_id: int) -> str:
    return jwt.encode({"sub": str(librarian_id), "scope": "id_review", "version": ID_CHECK_VERSION,
        "digest": check.digest, "kind": check.kind,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15)}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_review_token(token: str | None, content: bytes, librarian_id: int) -> dict:
    try:
        claims = jwt.decode(token or "", JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub", "scope", "version", "digest", "kind"]})
        if (claims["sub"] != str(librarian_id) or claims["scope"] != "id_review"
                or claims["version"] != ID_CHECK_VERSION
                or claims["digest"] != hashlib.sha256(content).hexdigest()):
            raise ValueError("Review does not match")
        return claims
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise HTTPException(422, "Check this ID again before confirming. The check has expired or the uploaded ID changed.") from None


def mark_identity_verified(member, claims: dict, librarian_id: int, reference: str) -> None:
    member.id_image_url = reference
    member.id_document_digest = claims["digest"]
    member.id_document_type = claims["kind"]
    member.id_verified_at = now_ph()
    member.id_verified_by_id = librarian_id


def has_verified_identity(member) -> bool:
    return bool(member.id_image_url and member.id_document_digest and member.id_verified_at and member.id_verified_by_id)


def _same_face(first: dict, second: dict) -> bool:
    from services import face_engine_service as engine
    selected = first.get("engine", "dlib")
    left, right = first.get("encoding"), second.get("encoding")
    if selected != second.get("engine", "dlib"):
        selected = "dlib"
        left = first.get("encoding") if first.get("engine") == "dlib" else first.get("dlib_encoding")
        right = second.get("encoding") if second.get("engine") == "dlib" else second.get("dlib_encoding")
    if not left or not right or len(left) != len(right):
        return False
    score = engine._distance(left, right, selected)
    return bool(np.isfinite(score) and score < engine._purpose_threshold("login", selected))


def verify_remote_identity(member, id_image: str, live_face: dict) -> None:
    from services.storage_service import read_private_upload
    if not has_verified_identity(member):
        raise HTTPException(403, "A librarian must first verify your original photo ID in person. Existing face sign-in and password access are unchanged.")
    try:
        raw = id_image.split(",", 1)[1] if "," in id_image else id_image
        content = base64.b64decode(raw, validate=True)
    except (ValueError, TypeError):
        raise HTTPException(422, "Upload a readable photo of your ID.") from None
    uploaded = inspect_document(content)
    baseline = read_private_upload(member.id_image_url, folder="ids", max_bytes=MAX_ID_BYTES)
    if hashlib.sha256(baseline).hexdigest() != member.id_document_digest:
        raise HTTPException(409, "Your saved ID needs librarian review before online face enrollment can continue.")
    _, baseline_frame = document_image(baseline)
    original_face = document_face(baseline_frame)
    if not (_same_face(uploaded.face, original_face) and _same_face(live_face, original_face)
            and _same_face(live_face, uploaded.face)):
        raise HTTPException(422, "The live face and ID portrait could not be matched to your verified library ID. Retake clear photos or ask the library desk for help.")


def enroll_remote_face(db, member, body) -> None:
    from services import face_engine_service as engine
    from services.face_enrollment_consent import record_enrollment_consent
    from services.liveness_service import require_live_enrollment
    if not has_verified_identity(member):
        raise HTTPException(403, "Visit the library once so a librarian can verify your original photo ID before online face enrollment.")
    if not body.id_image:
        raise HTTPException(422, "A photo ID is required for online face enrollment.")
    try:
        faces = engine.detect_faces(body.image, max_faces=2)
    except RuntimeError:
        raise HTTPException(503, "Face recognition is temporarily unavailable.") from None
    if len(faces) != 1:
        raise HTTPException(422, "Capture one live face in good lighting before continuing.")
    # Do not run PAD on a printed ID portrait. Only the live camera must pass it.
    require_live_enrollment(body.image, faces)
    verify_remote_identity(member, body.id_image, faces[0])
    if engine.find_duplicate_for_enrollment(db, faces[0], member.id) is not None:
        raise HTTPException(409, "This face is already registered to another account. Ask the librarian for assistance.")
    engine.store_enrollment_face(db, member, faces[0], source="remote_id_checked")
    record_enrollment_consent(member)
    member.face_consent_method = "self_id_checked"
    member.face_id_verified_at = now_ph()
