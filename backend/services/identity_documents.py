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
from services.id_face_verifier import PortraitDetectionError
from services.identity_portraits import COMPARISON_PREPROCESSING, comparison_face, portrait_quality
from timezone_utils import now_ph

ID_CHECK_VERSION = "2026-11-25"
MAX_ID_BYTES = 10 * 1024 * 1024
_ocr = None
_ocr_lock = Lock()
_MODEL_HASHES = {"eng.traineddata": "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"}
_MODEL_ROOT = Path(__file__).resolve().parents[1] / "assets" / "id_ocr"
DOCUMENT_KINDS = frozenset({"national_id", "tin_id", "drivers_license", "passport", "umid", "prc",
    "postal_id", "sss", "gsis", "voters_id", "senior_citizen", "pwd"})


class DocumentReadabilityError(HTTPException):
    """Text could not be checked; only supervised staff may review the original."""


class IdentityComparisonError(HTTPException):
    def __init__(self, message, diagnostic):
        super().__init__(422, message)
        self.diagnostic = diagnostic


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
            # Avoid another lossy JPEG pass before reading a small printed portrait.
            image.save(buffer, format="PNG", compress_level=1)
            frame = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
            return np.array(image), frame
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Use a clear JPG, PNG or WEBP photo of the complete ID, with readable text and portrait. PDF and small thumbnails cannot be checked.") from None


def read_id_text(rgb: np.ndarray) -> list[str]:
    """Local LSTM OCR with a bundled model. No external service or downloads."""
    global _ocr
    try:
        with _ocr_lock:
            if _ocr is None:
                from tesserocr import OEM, PSM, PyTessBaseAPI
                for filename, expected in _MODEL_HASHES.items():
                    if hashlib.sha256((_MODEL_ROOT / filename).read_bytes()).hexdigest() != expected:
                        raise RuntimeError("OCR model checksum mismatch")
                _ocr = PyTessBaseAPI(path=str(_MODEL_ROOT), lang="eng", oem=OEM.LSTM_ONLY, psm=PSM.SPARSE_TEXT)
                _ocr.SetVariable("user_defined_dpi", "300")
            try:
                from tesserocr import RIL, iterate_level
                _ocr.SetImage(Image.fromarray(rgb))
                _ocr.Recognize()
                iterator = _ocr.GetIterator()
                if iterator is None:
                    return []
                lines = []
                for row in iterate_level(iterator, RIL.TEXTLINE):
                    value = (row.GetUTF8Text(RIL.TEXTLINE) or "").strip()
                    if value and row.Confidence(RIL.TEXTLINE) >= 65:
                        lines.append(value)
                    if len(lines) >= 100:
                        break
                return lines
            finally:
                # Do not carry an ID image, OCR output or adaptive state to the next request.
                _ocr.ClearAdaptiveClassifier()
                _ocr.Clear()
    except Exception:
        # Do not return native errors, recognized text or private paths.
        raise DocumentReadabilityError(503, "ID text checking is temporarily unavailable. Try again or ask the library desk for help.") from None


def _tin_name_candidates(lines: list[str]) -> list[str]:
    """Some TIN layouts print the holder's name without a field label.

    Skip recognizable field labels and issuer headings. Ambiguous candidates
    support layout recognition but are not used for automatic name filling.
    """
    headings = set("ADDRESS BIR BIRTH BIRTHDATE BUREAU CARD CITY COMMISSIONER COUNTRY DATE DEPARTMENT DIGITAL DISTRICT FINANCE FORM GOVERNMENT HOLDER IDENTIFICATION INTERNAL ISSUANCE ISSUED MUNICIPALITY NAME NATIONALITY NONTRANSFERABLE NUMBER OF OFFICE PHOTO PHILIPPINES PROVINCE REGISTRATION REPUBLIC REVENUE SIGNATURE TAX TAXPAYER TIN VALID VERIFICATION".split())
    candidates = []
    for line in lines:
        value = line.strip()
        words = _normalize(value).split()
        if not 2 <= len(words) <= 12 or not 5 <= len(value) <= 120:
            continue
        if headings.intersection(words) or not all(character.isalpha() or character in " .,'-\u2019" for character in value):
            continue
        if value not in candidates:
            candidates.append(value)
    return candidates


def _is_tin_card(text: str) -> bool:
    issuer = re.search(r"\bBUREAU\s*OF\s*INTERNAL\s*REVENUE\b|\bBIR\b", text)
    heading = re.search(
        r"\bTAX\s*PAYER(?:\s*S)?\s*IDENTIFICATION\s*(?:NUMBER|CARD)\b|"
        r"\bTAX\s*IDENTIFICATION\s*(?:NUMBER|CARD)\b|\b(?:DIGITAL\s*)?TIN\s*ID\b|"
        r"\bBIR\s*FORM(?:\s*NO)?\s*1931\b", text
    )
    if not issuer or not heading:
        return False
    # A TIN can also appear on tax forms, invoices and certificates. These are
    # not photo IDs. Form 1931 is the physical TIN card itself.
    forms = re.findall(r"\b(?:BIR\s*)?FORM(?:\s*NO)?\s*(\d{4})\b", text)
    if any(number != "1931" for number in forms) or re.search(
        r"\b(?:CERTIFICATE OF REGISTRATION|CERTIFICATION OF REGISTRATION|OFFICIAL RECEIPT|SALES INVOICE|TAX RETURN|TAX CLEARANCE|APPLICATION FOR REGISTRATION)\b", text
    ):
        raise HTTPException(422, "Upload the photo side of the TIN ID, not a BIR tax form, receipt or registration certificate.")
    # Format recognition only; never store/return the tax number or claim BIR authentication.
    if not re.search(r"(?<![A-Z0-9])\d{3}(?: ?\d{3}){2}(?: ?\d{3})?(?![A-Z0-9])", text):
        raise DocumentReadabilityError(422, "The TIN ID heading was detected, but its printed number is not readable. Upload a clearer photo of the complete front, including the name and portrait.")
    return True


def classify_document(lines: list[str]) -> str:
    text = " ".join(_normalize(line) for line in lines)
    if re.search(r"\b(SPECIMEN|NOT VALID|FAKE ID|SAMPLE ONLY)\b", text):
        raise HTTPException(422, "This image is marked as a sample or invalid document. Present an original valid photo ID.")
    # Readable evidence that this is a tax document must also block manual review,
    # even if the TIN-card heading was not recognized.
    forms = re.findall(r"\bBIR\s*FORM(?:\s*NO)?\s*(\d{4})\b", text)
    if any(number != "1931" for number in forms) or re.search(
        r"\b(?:CERTIFICATE OF REGISTRATION|CERTIFICATION OF REGISTRATION|OFFICIAL RECEIPT|SALES INVOICE|TAX RETURN|TAX CLEARANCE|APPLICATION FOR REGISTRATION)\b", text
    ):
        raise HTTPException(422, "Upload the photo side of the TIN ID, not a BIR tax form, receipt or registration certificate.")
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
    is_tin = _is_tin_card(text)
    has_name = re.search(r"\b(NAME|APELYIDO|PANGALAN|SURNAME|HOLDER)\b", text)
    if is_tin:
        if not (has_name or _tin_name_candidates(lines)):
            raise DocumentReadabilityError(422, "The TIN ID was detected, but the holder's name is not readable. Upload a clearer photo of the complete front, with the name and portrait visible.")
        return "tin_id"
    if len(text) < 65 or not has_name:
        raise DocumentReadabilityError(422, "The ID text could not be read clearly enough. Include the complete ID with its name, issuer and portrait, or have a librarian review the original in person.")
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
    for kind, pattern in kinds:
        if re.search(pattern, text):
            return kind
    raise DocumentReadabilityError(422, "The ID type could not be identified. Use a supported Philippine government photo ID, or ask the library desk for help.")


def suggested_fields(lines: list[str], *, document_type: str | None = None) -> tuple[str | None, str | None]:
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
    name = value_after([r"full\s+name", r"taxpayer(?:'s)?\s+name", r"name\s+of\s+taxpayer", r"name(?=\s|:|$)", r"pangalan(?=\s|:|$)"])
    if not name:
        last = value_after([r"(?:last\s+name|surname|apelyido)(?:\s*/\s*(?:last\s+name|surname))?"])
        first = value_after([r"(?:given\s+names?|first\s+name|mga\s+pangalan)(?:\s*/\s*(?:given\s+names?|first\s+name))?"])
        middle = value_after([r"(?:middle\s+name|gitnang\s+apelyido)(?:\s*/\s*middle\s+name)?"])
        name = " ".join(value for value in (first, middle, last) if value) if first and last else None
    if not name and document_type == "tin_id":
        candidates = _tin_name_candidates(lines)
        name = candidates[0] if len(candidates) == 1 else None
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


def inspect_document(content: bytes, *, manual_kind: str | None = None) -> DocumentCheck:
    if manual_kind is not None and manual_kind not in DOCUMENT_KINDS:
        raise HTTPException(422, "Choose the government photo ID type being inspected in person.")
    rgb, frame = document_image(content)
    try:
        lines = read_id_text(rgb)
        kind = classify_document(lines)
    except DocumentReadabilityError:
        if manual_kind is None:
            raise
        # The caller must authorize this from a librarian's password-confirmed
        # review, or an already verified manual baseline. Never from member input.
        return DocumentCheck(hashlib.sha256(content).hexdigest(), "manual_" + manual_kind,
            None, None, document_face(frame))
    name, location = suggested_fields(lines, document_type=kind)
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
                or claims["kind"] not in DOCUMENT_KINDS | {"manual_" + kind for kind in DOCUMENT_KINDS}
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


def _sface_maximum_distance():
    from config import ID_FACE_MAX_DISTANCE
    from services import face_engine_service as engine
    from services.id_face_verifier import REFERENCE_MAX_DISTANCE
    if ID_FACE_MAX_DISTANCE:
        try:
            value = float(ID_FACE_MAX_DISTANCE)
        except (TypeError, ValueError):
            return None
        return value if np.isfinite(value) and 0 < value <= REFERENCE_MAX_DISTANCE else None
    # Compatibility only until a separately reviewed SFace policy is supplied.
    # Scores from different recognition models are not interchangeable calibration.
    value = engine._purpose_threshold("login", "insightface")
    return min(REFERENCE_MAX_DISTANCE, value) if np.isfinite(value) and 0 < value <= 2 else None


def _same_face(first: dict, second: dict) -> bool:
    from services import face_engine_service as engine
    selected = first.get("engine", "dlib")
    left, right = first.get("encoding"), second.get("encoding")
    if "sface" in {selected, second.get("engine", "dlib")}:
        if selected != "sface" or second.get("engine") != "sface":
            return False  # A 128D SFace descriptor is not a 128D dlib descriptor.
        try:
            vectors = np.asarray([left, right], dtype=float)
            if vectors.shape != (2, 128) or not np.isfinite(vectors).all() or (np.linalg.norm(vectors, axis=1) == 0).any():
                return False
            score = engine._cosine_distance(left, right)
            maximum = _sface_maximum_distance()
            return bool(maximum is not None and np.isfinite(score) and score < maximum)
        except (TypeError, ValueError):
            return False
    if selected != second.get("engine", "dlib"):
        selected = "dlib"
        left = first.get("encoding") if first.get("engine") == "dlib" else first.get("dlib_encoding")
        right = second.get("encoding") if second.get("engine") == "dlib" else second.get("dlib_encoding")
    if not left or not right or len(left) != len(right):
        return False
    score = engine._distance(left, right, selected)
    return bool(np.isfinite(score) and score < engine._purpose_threshold("login", selected))


def _comparison_diagnostic(stage, pairs, inputs):
    from services import face_engine_service as engine
    distances = {}
    for name, (first, second) in pairs.items():
        value = None
        if first.get("engine") == second.get("engine") == "sface":
            try:
                vectors = np.asarray([first.get("encoding"), second.get("encoding")], dtype=float)
                if vectors.shape == (2, 128) and np.isfinite(vectors).all() and (np.linalg.norm(vectors, axis=1) > 0).all():
                    score = engine._cosine_distance(first["encoding"], second["encoding"])
                    if np.isfinite(score): value = round(float(score), 4)
            except (TypeError, ValueError):
                pass
        distances[name] = value
    maximum = _sface_maximum_distance()
    return {"model": "sface_2021dec_int8", "metric": "cosine_distance", "stage": stage,
        "preprocessing": COMPARISON_PREPROCESSING,
        "maximum_distance": round(maximum, 4) if maximum is not None else None,
        "distances": distances,
        "quality": {name: portrait_quality(frame, face) for name, (frame, face) in inputs.items()}}


def verify_remote_identity(member, id_image: str, live_face: dict, live_image: str) -> None:
    from services.storage_service import read_private_upload
    if not has_verified_identity(member):
        raise HTTPException(403, "A librarian must first verify your original photo ID in person. Existing face sign-in and password access are unchanged.")
    try:
        raw = id_image.split(",", 1)[1] if "," in id_image else id_image
        content = base64.b64decode(raw, validate=True)
    except (ValueError, TypeError):
        raise HTTPException(422, "Upload a readable photo of your ID.") from None
    # Staff-reviewed text is not reclassified as machine-verified text. This
    # exception is bound to the saved baseline, not a flag a member can submit.
    manual_kind = (member.id_document_type or "").removeprefix("manual_")
    if member.id_document_type == "manual_" + manual_kind and manual_kind in DOCUMENT_KINDS:
        uploaded = inspect_document(content, manual_kind=manual_kind)
    else:
        uploaded = inspect_document(content)
    baseline = read_private_upload(member.id_image_url, folder="ids", max_bytes=MAX_ID_BYTES)
    if hashlib.sha256(baseline).hexdigest() != member.id_document_digest:
        raise HTTPException(409, "Your saved ID needs librarian review before online face enrollment can continue.")
    _, baseline_frame = document_image(baseline)
    original_face = document_face(baseline_frame)
    _, uploaded_frame = document_image(content)
    # ID photos and live captures use one dedicated verifier. The original
    # detector's descriptors remain unchanged for legacy sign-in and deduplication.
    selected_engine = "sface"
    uploaded_portrait = comparison_face(uploaded_frame, uploaded.face,
        engine_name=selected_engine, label="uploaded ID")
    saved_portrait = comparison_face(baseline_frame, original_face,
        engine_name=selected_engine, label="saved library ID")
    pairs = {"id_to_saved": (uploaded_portrait, saved_portrait)}
    inputs = {"uploaded_id": (uploaded_frame, uploaded.face), "saved_id": (baseline_frame, original_face)}
    if not _same_face(uploaded_portrait, saved_portrait):
        # Detailed diagnostics require a matching original ID, not just a session.
        raise HTTPException(422, "The uploaded ID portrait did not match the ID verified by the librarian. Upload the same ID photo, with the full card in focus and no glare. If it is already the same photo, ask the librarian to review the saved ID.")
    inputs["live"] = (live_image, live_face)
    try:
        live_portrait = comparison_face(live_image, live_face,
            engine_name=selected_engine, label="live camera")
    except PortraitDetectionError as error:
        diagnostic = _comparison_diagnostic("live_alignment", pairs, inputs)
        diagnostic["detector_issue"] = error.reason
        raise IdentityComparisonError(error.detail, diagnostic) from None
    pairs.update({"live_to_saved": (live_portrait, saved_portrait), "live_to_id": (live_portrait, uploaded_portrait)})
    if not _same_face(live_portrait, saved_portrait):
        raise IdentityComparisonError("Your live face could not be matched to the saved library ID portrait. Face the camera straight on in even light, remove glare or anything covering your face, and retake the capture. If the ID photo is old or unclear, ask the librarian for assisted enrollment.",
            _comparison_diagnostic("live_to_saved", pairs, inputs))
    if not _same_face(live_portrait, uploaded_portrait):
        raise IdentityComparisonError("Your live face could not be matched to the uploaded ID portrait. Retake a sharp, straight-on camera capture and a clear photo of the complete ID, without glare.",
            _comparison_diagnostic("live_to_id", pairs, inputs))


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
    verify_remote_identity(member, body.id_image, faces[0], body.image)
    if engine.find_duplicate_for_enrollment(db, faces[0], member.id) is not None:
        raise HTTPException(409, "This face is already registered to another account. Ask the librarian for assistance.")
    engine.store_enrollment_face(db, member, faces[0], source="remote_id_checked")
    record_enrollment_consent(member)
    member.face_consent_method = "self_id_checked"
    member.face_id_verified_at = now_ph()
