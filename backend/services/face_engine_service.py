import json
from dataclasses import dataclass
from typing import Iterable, Optional

import numpy as np
from sqlalchemy.orm import Session

from config import (
    FACE_AUTO_UPGRADE_EMBEDDINGS,
    FACE_ENGINE,
    FACE_ENROLL_DEDUP_THRESHOLD,
    FACE_MATCH_MARGIN,
    FACE_MATCH_THRESHOLD,
    FACE_MATCH_THRESHOLD_GATE,
    FACE_MATCH_THRESHOLD_LOGIN,
    INSIGHTFACE_MODEL_PACK,
)
from models.face_embedding import FaceEmbedding
from models.user import User


INSIGHTFACE_AVAILABLE = False
_INSIGHTFACE_APP = None
_INSIGHTFACE_LOAD_ERROR: Optional[str] = None


@dataclass
class FaceMatch:
    user: User
    score: float
    engine: str


def _enabled_engines(engines: Optional[Iterable[str]] = None) -> list[str]:
    if engines:
        return [engine for engine in engines if engine in {"insightface", "dlib"}]
    if FACE_ENGINE == "insightface":
        return ["insightface"]
    if FACE_ENGINE == "dlib":
        return ["dlib"]
    return ["insightface", "dlib"]


def _decode_image(image: str) -> np.ndarray:
    from services.face_service import _decode_base64_image

    return _decode_base64_image(image)


def _box_from_bbox(bbox, image_shape) -> dict:
    from services.face_service import normalize_face_box

    left, top, right, bottom = [int(round(float(v))) for v in bbox[:4]]
    return normalize_face_box((top, right, bottom, left), image_shape)


def _quality_from_box(face_box: Optional[dict]) -> dict:
    if not face_box:
        return {"score": 0.0}
    area = max(0.0, float(face_box.get("width", 0))) * max(0.0, float(face_box.get("height", 0)))
    # A face occupying around 9% of the frame is already very usable.
    score = min(1.0, area / 0.09)
    return {"score": round(score, 4)}


def _get_insightface_app():
    global INSIGHTFACE_AVAILABLE, _INSIGHTFACE_APP, _INSIGHTFACE_LOAD_ERROR
    if _INSIGHTFACE_APP is not None:
        return _INSIGHTFACE_APP
    if _INSIGHTFACE_LOAD_ERROR:
        return None
    try:
        from insightface.app import FaceAnalysis

        app = FaceAnalysis(name=INSIGHTFACE_MODEL_PACK, providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=-1, det_size=(640, 640))
        _INSIGHTFACE_APP = app
        INSIGHTFACE_AVAILABLE = True
        return app
    except Exception as exc:  # pragma: no cover - depends on local optional model package
        _INSIGHTFACE_LOAD_ERROR = str(exc)
        INSIGHTFACE_AVAILABLE = False
        return None


def _detect_insightface_faces(image: str, max_faces: int) -> list[dict]:
    app = _get_insightface_app()
    if app is None:
        if FACE_ENGINE == "insightface":
            raise RuntimeError(
                "InsightFace is not available. Install insightface and onnxruntime, "
                "or set FACE_ENGINE=auto/dlib."
            )
        return []

    img_array = _decode_image(image)
    detected = list(app.get(img_array))[:max_faces]
    results = []
    for face in detected:
        embedding = getattr(face, "normed_embedding", None)
        if embedding is None:
            embedding = getattr(face, "embedding", None)
        if embedding is None:
            continue
        face_box = _box_from_bbox(face.bbox, img_array.shape)
        encoding = np.asarray(embedding, dtype=float).tolist()
        results.append(
            {
                "engine": "insightface",
                "encoding": encoding,
                "dimension": len(encoding),
                "face_box": face_box,
                "quality": _quality_from_box(face_box),
            }
        )

    if not results:
        return results

    # Keep legacy dlib enrollment/fallback data when both detectors agree.
    try:
        from services.face_service import detect_face_encodings

        dlib_faces = detect_face_encodings(image, max_faces=max_faces)
        if len(dlib_faces) == len(results):
            for result, dlib_face in zip(results, dlib_faces):
                result["dlib_encoding"] = dlib_face.get("encoding")
    except Exception:
        pass
    return results


def _detect_dlib_faces(image: str, max_faces: int) -> list[dict]:
    from services.face_service import detect_face_encodings

    faces = detect_face_encodings(image, max_faces=max_faces)
    results = []
    for face in faces:
        encoding = face.get("encoding")
        face_box = face.get("face_box")
        results.append(
            {
                "engine": "dlib",
                "encoding": encoding,
                "dimension": len(encoding or []),
                "face_box": face_box,
                "quality": _quality_from_box(face_box),
            }
        )
    return results


def detect_faces(image: str, max_faces: int = 4, engines: Optional[Iterable[str]] = None) -> list[dict]:
    last_error = None
    for engine in _enabled_engines(engines):
        try:
            if engine == "insightface":
                faces = _detect_insightface_faces(image, max_faces=max_faces)
            else:
                faces = _detect_dlib_faces(image, max_faces=max_faces)
        except Exception as exc:
            last_error = exc
            if FACE_ENGINE == engine:
                raise RuntimeError(str(exc)) from exc
            continue
        if faces:
            return faces
    if last_error and FACE_ENGINE == "insightface":
        raise last_error
    return []


def _euclidean_distance(live_encoding: list[float], stored_encoding: list[float]) -> float:
    live = np.asarray(live_encoding, dtype=float)
    stored = np.asarray(stored_encoding, dtype=float)
    if live.shape != stored.shape:
        return float("inf")
    return float(np.linalg.norm(live - stored))


def _cosine_distance(live_encoding: list[float], stored_encoding: list[float]) -> float:
    live = np.asarray(live_encoding, dtype=float)
    stored = np.asarray(stored_encoding, dtype=float)
    if live.shape != stored.shape:
        return float("inf")

    live_norm = np.linalg.norm(live)
    stored_norm = np.linalg.norm(stored)
    if live_norm == 0 or stored_norm == 0:
        return float("inf")

    similarity = float(np.dot(live, stored) / (live_norm * stored_norm))
    similarity = max(-1.0, min(1.0, similarity))
    return 1.0 - similarity


def _distance(live_encoding: list[float], stored_encoding: list[float], engine: str) -> float:
    if engine == "insightface":
        return _cosine_distance(live_encoding, stored_encoding)
    return _euclidean_distance(live_encoding, stored_encoding)


def _stored_embedding_rows(
    db: Session,
    engine: str,
    excluded_user_id: Optional[int] = None,
):
    query = db.query(FaceEmbedding).filter(
        FaceEmbedding.engine == engine,
        FaceEmbedding.is_active == True,
    )
    if excluded_user_id is not None:
        query = query.filter(FaceEmbedding.user_id != excluded_user_id)
    return query.all()


def find_best_match(
    db: Session,
    encoding: list[float],
    engine: str,
    *,
    threshold: Optional[float] = None,
    margin: float = FACE_MATCH_MARGIN,
    excluded_user_id: Optional[int] = None,
    users: Optional[list[User]] = None,
) -> Optional[FaceMatch]:
    threshold = FACE_MATCH_THRESHOLD if threshold is None and engine == "dlib" else threshold
    threshold = FACE_MATCH_THRESHOLD_LOGIN if threshold is None else threshold
    candidates: list[tuple[float, User]] = []

    if engine == "dlib":
        if users is None:
            query = db.query(User).filter(User.face_encoding.isnot(None))
            if excluded_user_id is not None:
                query = query.filter(User.id != excluded_user_id)
            users = query.all()
        for user in users:
            if not user.face_encoding:
                continue
            try:
                candidates.append((_distance(encoding, json.loads(user.face_encoding), engine), user))
            except Exception:
                continue
    else:
        for row in _stored_embedding_rows(db, engine, excluded_user_id=excluded_user_id):
            if not row.user:
                continue
            try:
                candidates.append((_distance(encoding, json.loads(row.embedding), engine), row.user))
            except Exception:
                continue

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0])
    best_score, best_user = candidates[0]
    if best_score > threshold:
        return None
    if len(candidates) > 1 and (candidates[1][0] - best_score) < margin:
        return None
    return FaceMatch(user=best_user, score=best_score, engine=engine)


def _purpose_threshold(purpose: str, engine: str) -> float:
    if purpose == "gate":
        return FACE_MATCH_THRESHOLD_GATE
    if engine == "dlib":
        return min(FACE_MATCH_THRESHOLD, FACE_MATCH_THRESHOLD_LOGIN)
    return FACE_MATCH_THRESHOLD_LOGIN


def _lock_current_match(db, match, encoding, threshold):
    """Do not authenticate or auto-upgrade a template removed during detection."""
    user = db.query(User).filter(User.id == match.user.id).with_for_update(key_share=True).populate_existing().first()
    if user is None or user.deleted_at is not None:
        return None
    templates = [user.face_encoding] if match.engine == "dlib" else [
        row.embedding for row in db.query(FaceEmbedding).filter(
            FaceEmbedding.user_id == user.id, FaceEmbedding.engine == match.engine,
            FaceEmbedding.is_active.is_(True)).populate_existing().all()
    ]
    for template in templates:
        if not template:
            continue
        try:
            score = _distance(encoding, json.loads(template), match.engine)
        except (ValueError, TypeError):
            continue
        if score <= threshold:
            return FaceMatch(user=user, score=score, engine=match.engine)
    return None


def revalidate_match_for_face(db, face, match, *, purpose="login", threshold=None):
    if match is None:
        return None
    encoding = face.get("encoding") if match.engine == face.get("engine", "dlib") else face.get("dlib_encoding")
    if not encoding:
        return None
    current = _lock_current_match(
        db, match, encoding, threshold if threshold is not None else _purpose_threshold(purpose, match.engine))
    if current and current.engine != face.get("engine", "dlib") and FACE_AUTO_UPGRADE_EMBEDDINGS:
        upsert_face_embedding(db, current.user, face["engine"], face["encoding"],
                             quality_score=(face.get("quality") or {}).get("score"), source="auto_upgrade")
    return current


def find_match_for_face(
    db: Session,
    face: dict,
    *,
    purpose: str = "login",
    excluded_user_id: Optional[int] = None,
    threshold: Optional[float] = None,
    lock_match: bool = True,
) -> Optional[FaceMatch]:
    engine = face.get("engine", "dlib")
    encoding = face.get("encoding")
    if not encoding:
        return None

    match = find_best_match(
        db,
        encoding,
        engine,
        threshold=threshold if threshold is not None else _purpose_threshold(purpose, engine),
        excluded_user_id=excluded_user_id,
    )
    if match:
        return match if excluded_user_id is not None or not lock_match else revalidate_match_for_face(
            db, face, match, purpose=purpose, threshold=threshold)

    dlib_encoding = face.get("dlib_encoding") if engine != "dlib" else None
    if not dlib_encoding:
        return None

    fallback = find_best_match(
        db,
        dlib_encoding,
        "dlib",
        threshold=threshold if threshold is not None else _purpose_threshold(purpose, "dlib"),
        excluded_user_id=excluded_user_id,
    )
    return fallback if excluded_user_id is not None or not lock_match else revalidate_match_for_face(
        db, face, fallback, purpose=purpose, threshold=threshold)


def find_duplicate_for_enrollment(db: Session, face: dict, user_id: int) -> Optional[FaceMatch]:
    match = find_match_for_face(
        db,
        face,
        purpose="login",
        excluded_user_id=user_id,
        threshold=FACE_ENROLL_DEDUP_THRESHOLD,
    )
    return match


def upsert_face_embedding(
    db: Session,
    user: User,
    engine: str,
    encoding: list[float],
    *,
    quality_score: Optional[float],
    source: str,
) -> FaceEmbedding:
    db.query(FaceEmbedding).filter(
        FaceEmbedding.user_id == user.id,
        FaceEmbedding.engine == engine,
        FaceEmbedding.is_active == True,
    ).update({FaceEmbedding.is_active: False}, synchronize_session=False)
    row = FaceEmbedding(
        user_id=user.id,
        engine=engine,
        dimension=len(encoding),
        embedding=json.dumps(encoding),
        quality_score=quality_score,
        source=source,
        is_active=True,
    )
    db.add(row)
    return row


def store_enrollment_face(db: Session, user: User, face: dict, *, source: str = "enrollment") -> None:
    # Explicit replacement must not leave an older engine recognizing the old face.
    db.query(FaceEmbedding).filter(FaceEmbedding.user_id == user.id).delete(synchronize_session=False)
    user.face_encoding = None
    dlib_encoding = face.get("dlib_encoding")
    if face.get("engine") == "dlib":
        dlib_encoding = face.get("encoding")
    if dlib_encoding:
        user.face_encoding = json.dumps(dlib_encoding)

    if face.get("engine") != "dlib" and face.get("encoding"):
        upsert_face_embedding(
            db,
            user,
            face["engine"],
            face["encoding"],
            quality_score=(face.get("quality") or {}).get("score"),
            source=source,
        )


def legacy_sync_user_embedding(db: Session, user: User) -> None:
    user = db.query(User).filter(User.id == user.id).with_for_update(key_share=True).populate_existing().one()
    if user.deleted_at is not None or not user.face_encoding:
        return
    exists = (
        db.query(FaceEmbedding)
        .filter(
            FaceEmbedding.user_id == user.id,
            FaceEmbedding.engine == "dlib",
            FaceEmbedding.is_active == True,
        )
        .first()
    )
    if exists:
        return
    try:
        encoding = json.loads(user.face_encoding)
    except Exception:
        return
    upsert_face_embedding(
        db,
        user,
        "dlib",
        encoding,
        quality_score=None,
        source="legacy_sync",
    )


def sync_legacy_face_embeddings(db: Session) -> int:
    changed = 0
    users = db.query(User).filter(User.face_encoding.isnot(None)).all()
    for user in users:
        before = (
            db.query(FaceEmbedding)
            .filter(
                FaceEmbedding.user_id == user.id,
                FaceEmbedding.engine == "dlib",
                FaceEmbedding.is_active == True,
            )
            .count()
        )
        legacy_sync_user_embedding(db, user)
        after = (
            db.query(FaceEmbedding)
            .filter(
                FaceEmbedding.user_id == user.id,
                FaceEmbedding.engine == "dlib",
                FaceEmbedding.is_active == True,
            )
            .count()
        )
        if after > before:
            changed += 1
    return changed
