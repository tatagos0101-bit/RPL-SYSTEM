# Face Anti-Spoofing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add passive liveness detection to all face recognition endpoints, with image quality guidance and a security alert system for spoof attempts.

**Architecture:** A new `liveness_service.py` runs two checks before every call to `encode_face()`: image quality (brightness, face size) and MiniFASNet ONNX inference. The hint it returns drives per-endpoint behavior — silent retry, user guidance, or spoof alert logging. Spoof attempts at enrollment are logged to a new `SecurityAlert` DB model visible to librarians.

**Tech Stack:** Python/FastAPI backend — `onnxruntime` (ONNX inference, CPU-only), `face_recognition` (face location reused). React/Vite frontend — new `/lib/alerts` page, new overlays in EntryGate and BorrowReturn.

---

## File Map

### New Backend Files
- `backend/download_models.py` — one-time ONNX model download script
- `backend/services/liveness_service.py` — quality checks + MiniFASNet inference → hint string
- `backend/models/security_alert.py` — SQLAlchemy `SecurityAlert` ORM model
- `backend/schemas/alerts.py` — Pydantic schemas for alert endpoints
- `backend/routers/alerts.py` — `GET/PATCH` security alert endpoints
- `backend/tests/test_liveness_service.py` — unit tests for liveness service

### Modified Backend Files
- `backend/requirements.txt` — add `onnxruntime==1.19.2`
- `backend/config.py` — add 4 liveness threshold constants
- `backend/database.py` — import `security_alert` model in `init_db()`
- `backend/main.py` — register `alerts` router
- `backend/routers/auth.py` — call `check_liveness()` in all 3 face endpoints
- `backend/routers/librarian.py` — call `check_liveness()` in `librarian_enroll_face`

### New Frontend Files
- `frontend/src/api/alerts.js` — alerts API wrapper
- `frontend/src/pages/lib/LibAlerts.jsx` — security alerts page

### Modified Frontend Files
- `frontend/src/App.jsx` — add `/lib/alerts` route
- `frontend/src/components/LibLayout.jsx` — add Alerts nav link + red badge
- `frontend/src/pages/lib/EntryGate.jsx` — handle `too_dark` / `too_far` messages
- `frontend/src/pages/lib/LibBorrowReturn.jsx` — check `matched` flag + handle guidance hints

---

## Task 1: Setup — requirements, config, model directory, download script

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config.py`
- Modify: `.gitignore`
- Create: `backend/download_models.py`

- [ ] **Step 1: Add onnxruntime to requirements.txt**

  Open `backend/requirements.txt` and add after the `numpy` line:
  ```
  onnxruntime==1.19.2
  ```

- [ ] **Step 2: Install the new dependency**

  ```bash
  cd backend && pip install onnxruntime==1.19.2
  ```
  Expected: onnxruntime installed successfully.

- [ ] **Step 3: Add liveness thresholds to config.py**

  In `backend/config.py`, append after the `FACE_POLL_CONFIDENCE` line:
  ```python
  # ── Liveness / anti-spoofing ──────────────────────────────────────────────────
  LIVENESS_BRIGHTNESS_MIN  = int(os.getenv("LIVENESS_BRIGHTNESS_MIN",  "40"))   # mean pixel brightness 0-255
  LIVENESS_FACE_MIN_SIZE   = int(os.getenv("LIVENESS_FACE_MIN_SIZE",   "80"))   # minimum face bbox height (px)
  LIVENESS_SPOOF_THRESHOLD = float(os.getenv("LIVENESS_SPOOF_THRESHOLD", "0.6"))  # real_prob >= threshold → real
  LIVENESS_UNCERTAIN_BAND  = float(os.getenv("LIVENESS_UNCERTAIN_BAND",  "0.15")) # within band → retry
  ```

- [ ] **Step 4: Gitignore the model file**

  Open the root `.gitignore` (or create one at the project root if it doesn't exist) and add:
  ```
  # Anti-spoofing ONNX model (download via backend/download_models.py)
  backend/models/anti_spoof.onnx
  ```

- [ ] **Step 5: Create the models directory placeholder**

  ```bash
  mkdir -p backend/models && touch backend/models/.gitkeep
  ```

- [ ] **Step 6: Create backend/download_models.py**

  ```python
  """
  One-time script to download the MiniFASNetV2 ONNX anti-spoofing model.

  Run from the backend/ directory:
      python download_models.py

  Model source: minivision-ai Silent-Face-Anti-Spoofing (Apache 2.0)
  If the primary URL fails, download manually from:
    https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
  and place the file at backend/models/anti_spoof.onnx
  """
  import os
  import urllib.request

  MODEL_URL = (
      "https://raw.githubusercontent.com/minivision-ai/Silent-Face-Anti-Spoofing"
      "/master/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.onnx"
  )

  DEST_PATH = os.path.join(os.path.dirname(__file__), "models", "anti_spoof.onnx")


  def download():
      if os.path.exists(DEST_PATH):
          print(f"Model already exists at {DEST_PATH} — skipping download.")
          return

      os.makedirs(os.path.dirname(DEST_PATH), exist_ok=True)
      print(f"Downloading anti-spoof model to {DEST_PATH} …")

      try:
          urllib.request.urlretrieve(MODEL_URL, DEST_PATH)
          size_kb = os.path.getsize(DEST_PATH) // 1024
          print(f"Done. Model size: {size_kb} KB")
      except Exception as e:
          # Clean up partial download
          if os.path.exists(DEST_PATH):
              os.remove(DEST_PATH)
          print(f"ERROR: Download failed — {e}")
          print("Manual steps:")
          print("  1. Visit https://github.com/minivision-ai/Silent-Face-Anti-Spoofing")
          print("  2. Download resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.onnx")
          print(f"  3. Place the file at: {DEST_PATH}")
          raise SystemExit(1)


  if __name__ == "__main__":
      download()
  ```

- [ ] **Step 7: Run the download script**

  ```bash
  cd backend && python download_models.py
  ```
  Expected: "Done. Model size: ~NNN KB" (file appears at `backend/models/anti_spoof.onnx`).

- [ ] **Step 8: Commit**

  ```bash
  git add backend/requirements.txt backend/config.py backend/download_models.py backend/models/.gitkeep .gitignore
  git commit -m "feat: add onnxruntime, liveness thresholds, and model download script"
  ```

---

## Task 2: Liveness Service

**Files:**
- Create: `backend/services/liveness_service.py`
- Create: `backend/tests/test_liveness_service.py`

- [ ] **Step 1: Create the test file first**

  Create `backend/tests/__init__.py` (empty) and `backend/tests/test_liveness_service.py`:
  ```python
  """
  Unit tests for liveness_service.check_liveness().

  These tests run without the ONNX model present — they verify quality check
  logic (brightness, face size) using synthetic numpy images.
  """
  import base64
  import io
  import numpy as np
  import pytest
  from PIL import Image


  def _make_b64_image(array: np.ndarray) -> str:
      """Encode a numpy RGB array as a base64 JPEG string."""
      img = Image.fromarray(array.astype(np.uint8))
      buf = io.BytesIO()
      img.save(buf, format="JPEG")
      return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


  def _dark_image() -> str:
      """640x480 image with mean brightness ~15 (too dark)."""
      arr = np.full((480, 640, 3), 15, dtype=np.uint8)
      return _make_b64_image(arr)


  def _bright_image() -> str:
      """640x480 image with mean brightness ~180."""
      arr = np.full((480, 640, 3), 180, dtype=np.uint8)
      return _make_b64_image(arr)


  def test_too_dark_returns_correct_hint():
      from services.liveness_service import _check_brightness
      dark_arr = np.full((480, 640, 3), 15, dtype=np.uint8)
      assert _check_brightness(dark_arr) is False


  def test_bright_image_passes_brightness_check():
      from services.liveness_service import _check_brightness
      bright_arr = np.full((480, 640, 3), 180, dtype=np.uint8)
      assert _check_brightness(bright_arr) is True


  def test_check_liveness_returns_too_dark_for_dark_image():
      from services import liveness_service
      # Bypass the ONNX model — force model not available
      original_session = liveness_service._session
      liveness_service._session = None
      # Patch _get_session to always return None (model not installed)
      original_get = liveness_service._get_session
      liveness_service._get_session = lambda: None

      result = liveness_service.check_liveness(_dark_image())
      assert result == "too_dark"

      liveness_service._get_session = original_get
      liveness_service._session = original_session


  def test_check_liveness_returns_ok_when_model_missing_and_face_detected(monkeypatch):
      """When model file is absent, check_liveness() should degrade to 'ok' if face passes quality."""
      import face_recognition
      from services import liveness_service

      # Patch face_locations to return a fake large face bbox
      monkeypatch.setattr(face_recognition, "face_locations", lambda img: [(50, 300, 250, 100)])
      monkeypatch.setattr(liveness_service, "_get_session", lambda: None)

      result = liveness_service.check_liveness(_bright_image())
      assert result == "ok"


  def test_check_liveness_returns_retry_for_corrupt_image():
      from services.liveness_service import check_liveness
      result = check_liveness("not_valid_base64!!!")
      assert result == "retry"
  ```

- [ ] **Step 2: Run tests — expect failures (liveness_service doesn't exist yet)**

  ```bash
  cd backend && python -m pytest tests/test_liveness_service.py -v 2>&1 | head -20
  ```
  Expected: `ModuleNotFoundError` or import errors — confirms tests are wired correctly.

- [ ] **Step 3: Create backend/services/liveness_service.py**

  ```python
  """
  Liveness / anti-spoofing service.

  check_liveness(b64_image) → hint:
    "ok"       — live face, proceed to recognition
    "too_dark" — frame too dark, suggest more light
    "too_far"  — face too small, suggest moving closer
    "retry"    — uncertain or no face, skip frame silently
    "spoof"    — confident 2D presentation attack
  """
  import base64
  import io
  import logging
  import os
  from typing import Optional

  import numpy as np
  from PIL import Image

  logger = logging.getLogger(__name__)

  # Lazy-loaded onnxruntime session — None until first call
  _session = None
  _SESSION_TRIED = False  # avoid retrying on every request if model is missing

  _MODEL_PATH = os.path.abspath(
      os.path.join(os.path.dirname(__file__), "..", "models", "anti_spoof.onnx")
  )


  def _get_session():
      global _session, _SESSION_TRIED
      if _SESSION_TRIED:
          return _session
      _SESSION_TRIED = True
      try:
          import onnxruntime as ort
          if not os.path.exists(_MODEL_PATH):
              logger.warning(
                  "Anti-spoof model not found at %s — liveness check disabled. "
                  "Run: python download_models.py",
                  _MODEL_PATH,
              )
              return None
          _session = ort.InferenceSession(_MODEL_PATH, providers=["CPUExecutionProvider"])
          logger.info("Anti-spoof model loaded: %s", _MODEL_PATH)
          return _session
      except Exception as exc:
          logger.warning("Failed to load anti-spoof model: %s — liveness check disabled", exc)
          return None


  def _decode_image(b64_string: str) -> np.ndarray:
      """Decode a base64 JPEG/PNG (with or without data-URI prefix) to a numpy RGB array."""
      if "," in b64_string:
          b64_string = b64_string.split(",", 1)[1]
      img_bytes = base64.b64decode(b64_string)
      img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
      return np.array(img)


  def _check_brightness(img_array: np.ndarray) -> bool:
      """Return True if mean pixel brightness meets the configured minimum."""
      from config import LIVENESS_BRIGHTNESS_MIN
      return float(np.mean(img_array)) >= LIVENESS_BRIGHTNESS_MIN


  def _preprocess_face(img_array: np.ndarray, bbox: tuple) -> np.ndarray:
      """
      Crop face region with 20% padding, resize to 80x80, apply ImageNet
      normalisation, and return an NCHW float32 tensor for MiniFASNetV2.
      """
      top, right, bottom, left = bbox
      h, w = img_array.shape[:2]
      pad = int((bottom - top) * 0.2)
      top    = max(0, top - pad)
      left   = max(0, left - pad)
      bottom = min(h, bottom + pad)
      right  = min(w, right + pad)

      face = img_array[top:bottom, left:right]
      face = np.array(Image.fromarray(face).resize((80, 80)), dtype=np.float32) / 255.0
      mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
      std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
      face = (face - mean) / std
      return face.transpose(2, 0, 1)[np.newaxis, :].astype(np.float32)  # NCHW


  def check_liveness(b64_image: str) -> str:
      """
      Run quality checks and liveness inference on a single webcam frame.
      Returns hint string: "ok" | "too_dark" | "too_far" | "retry" | "spoof"
      """
      from config import LIVENESS_FACE_MIN_SIZE, LIVENESS_SPOOF_THRESHOLD, LIVENESS_UNCERTAIN_BAND

      # ── Decode ────────────────────────────────────────────────────────────────
      try:
          img_array = _decode_image(b64_image)
      except Exception:
          return "retry"

      # ── Quality check 1: brightness ───────────────────────────────────────────
      if not _check_brightness(img_array):
          return "too_dark"

      # ── Face detection (reuse dlib via face_recognition) ──────────────────────
      try:
          import face_recognition
          locations = face_recognition.face_locations(img_array)
      except Exception:
          return "retry"

      if not locations:
          return "retry"

      # Pick the largest detected face
      bbox = max(locations, key=lambda b: (b[2] - b[0]) * (b[1] - b[3]))
      top, right, bottom, left = bbox
      face_height = bottom - top

      # ── Quality check 2: face size (too far) ──────────────────────────────────
      if face_height < LIVENESS_FACE_MIN_SIZE:
          return "too_far"

      # ── Liveness inference ────────────────────────────────────────────────────
      session = _get_session()
      if session is None:
          return "ok"  # model unavailable — degrade gracefully

      try:
          face_input = _preprocess_face(img_array, bbox)
          input_name = session.get_inputs()[0].name
          raw = session.run(None, {input_name: face_input})[0][0]  # shape (2,)

          # Softmax to get probabilities
          exp = np.exp(raw - np.max(raw))
          probs = exp / exp.sum()
          real_prob = float(probs[1])  # index 1 = real, index 0 = spoof

          threshold = LIVENESS_SPOOF_THRESHOLD
          if real_prob >= threshold:
              return "ok"
          elif real_prob >= (threshold - LIVENESS_UNCERTAIN_BAND):
              return "retry"
          else:
              return "spoof"

      except Exception as exc:
          logger.warning("Liveness inference error: %s", exc)
          return "retry"
  ```

- [ ] **Step 4: Run tests — expect pass**

  ```bash
  cd backend && python -m pytest tests/test_liveness_service.py -v
  ```
  Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/services/liveness_service.py backend/tests/
  git commit -m "feat: add liveness_service with quality checks and MiniFASNet ONNX inference"
  ```

---

## Task 3: SecurityAlert Model and Schema

**Files:**
- Create: `backend/models/security_alert.py`
- Create: `backend/schemas/alerts.py`
- Modify: `backend/database.py`

- [ ] **Step 1: Create backend/models/security_alert.py**

  ```python
  from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey
  from sqlalchemy.orm import relationship
  from sqlalchemy.sql import func
  from database import Base


  class SecurityAlert(Base):
      __tablename__ = "security_alerts"

      id           = Column(Integer, primary_key=True, index=True)
      alert_type   = Column(String(32),  nullable=False)   # SPOOF_ENROLL | SPOOF_ENTRY | SPOOF_LOOKUP
      user_id      = Column(Integer, ForeignKey("users.id"), nullable=True)  # account being spoofed (if known)
      ip_address   = Column(String(64),  nullable=True)
      snapshot_b64 = Column(Text,        nullable=True)    # base64 spoof image for evidence
      created_at   = Column(DateTime(timezone=True), server_default=func.now())
      is_read      = Column(Boolean, nullable=False, default=False)

      user = relationship("User", foreign_keys=[user_id])
  ```

- [ ] **Step 2: Create backend/schemas/alerts.py**

  ```python
  from datetime import datetime
  from typing import Optional
  from pydantic import BaseModel


  class SecurityAlertOut(BaseModel):
      id:           int
      alert_type:   str
      user_id:      Optional[int]
      user_name:    Optional[str]   # resolved from relationship
      ip_address:   Optional[str]
      snapshot_b64: Optional[str]
      created_at:   datetime
      is_read:      bool

      model_config = {"from_attributes": True}


  class UnreadCountOut(BaseModel):
      unread_count: int
  ```

- [ ] **Step 3: Register SecurityAlert in database.py**

  In `backend/database.py`, update the import line inside `init_db()`:
  ```python
  def init_db():
      """Create all tables. Called once on startup."""
      # Import all models so Base knows about them before create_all
      from models import user, book, transaction, reservation, entry_log, reading_goal, library_settings, notification, security_alert  # noqa: F401
      Base.metadata.create_all(bind=engine)

      # Add new columns to existing tables without dropping data.
      _add_column_if_missing("entry_logs",   "time_out", "DATETIME")
      _add_column_if_missing("notifications", "user_id",  "INT")
  ```

- [ ] **Step 4: Verify table creation**

  ```bash
  cd backend && python -c "from database import init_db; init_db(); print('security_alerts table created')"
  ```
  Expected: "security_alerts table created" with no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/models/security_alert.py backend/schemas/alerts.py backend/database.py
  git commit -m "feat: add SecurityAlert model and schema"
  ```

---

## Task 4: Security Alerts Router + main.py Registration

**Files:**
- Create: `backend/routers/alerts.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create backend/routers/alerts.py**

  ```python
  """
  Security alert endpoints — all require librarian JWT.
  """
  from fastapi import APIRouter, Depends
  from sqlalchemy.orm import Session
  from sqlalchemy import desc

  from database import get_db
  from dependencies import require_librarian
  from models.security_alert import SecurityAlert
  from models.user import User
  from schemas.alerts import SecurityAlertOut, UnreadCountOut

  router = APIRouter(prefix="/api/librarian/security-alerts", tags=["Security Alerts"])


  @router.get("", response_model=list[SecurityAlertOut])
  def list_alerts(
      unread_only: bool = False,
      db: Session = Depends(get_db),
      _: User = Depends(require_librarian),
  ):
      """Return security alerts newest-first. Pass unread_only=true to filter."""
      q = db.query(SecurityAlert)
      if unread_only:
          q = q.filter(SecurityAlert.is_read == False)
      alerts = q.order_by(desc(SecurityAlert.created_at)).limit(200).all()
      return [
          SecurityAlertOut(
              id=a.id,
              alert_type=a.alert_type,
              user_id=a.user_id,
              user_name=a.user.name if a.user else None,
              ip_address=a.ip_address,
              snapshot_b64=a.snapshot_b64,
              created_at=a.created_at,
              is_read=a.is_read,
          )
          for a in alerts
      ]


  @router.get("/unread-count", response_model=UnreadCountOut)
  def unread_count(
      db: Session = Depends(get_db),
      _: User = Depends(require_librarian),
  ):
      count = db.query(SecurityAlert).filter(SecurityAlert.is_read == False).count()
      return UnreadCountOut(unread_count=count)


  @router.patch("/{alert_id}/read")
  def mark_read(
      alert_id: int,
      db: Session = Depends(get_db),
      _: User = Depends(require_librarian),
  ):
      alert = db.query(SecurityAlert).filter(SecurityAlert.id == alert_id).first()
      if not alert:
          from fastapi import HTTPException
          raise HTTPException(status_code=404, detail="Alert not found")
      alert.is_read = True
      db.commit()
      return {"success": True}


  @router.post("/read-all")
  def mark_all_read(
      db: Session = Depends(get_db),
      _: User = Depends(require_librarian),
  ):
      db.query(SecurityAlert).filter(SecurityAlert.is_read == False).update({"is_read": True})
      db.commit()
      return {"success": True}
  ```

- [ ] **Step 2: Register the router in main.py**

  In `backend/main.py`, update the import line:
  ```python
  from routers import auth, users, books, inventory, transactions, reservations, librarian, recommendations, reports, kiosk, alerts
  ```

  And add after `app.include_router(kiosk.router)`:
  ```python
  app.include_router(alerts.router)
  ```

- [ ] **Step 3: Verify endpoints appear in API docs**

  ```bash
  cd backend && python -c "from main import app; routes = [r.path for r in app.routes]; print([r for r in routes if 'alert' in r])"
  ```
  Expected: list containing `/api/librarian/security-alerts`, `/api/librarian/security-alerts/unread-count`, etc.

- [ ] **Step 4: Commit**

  ```bash
  git add backend/routers/alerts.py backend/main.py
  git commit -m "feat: add security alerts router with list, unread-count, mark-read endpoints"
  ```

---

## Task 5: Wire Liveness into Entry Gate (/api/auth/face)

**Files:**
- Modify: `backend/routers/auth.py`

- [ ] **Step 1: Add liveness check + alert logging to the face_auth endpoint**

  In `backend/routers/auth.py`, replace the `face_auth` function body. Find the section starting at line 108 and replace the entire function with:

  ```python
  @router.post("/face", response_model=FaceAuthResponse)
  @limiter.limit("120/minute")
  def face_auth(request: Request, body: FaceAuthRequest, db: Session = Depends(get_db)):
      """
      Called by EntryGate every ~900ms.
      Identifies the person → upserts session log (time_in / time_out) → returns match info.
      """
      from services.face_service import encode_face, find_match
      from services.liveness_service import check_liveness
      from models.security_alert import SecurityAlert
      from sqlalchemy import desc as _desc, or_, and_

      ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()

      # ── Liveness check ────────────────────────────────────────────────────────
      hint = check_liveness(body.image)
      if hint == "too_dark":
          return FaceAuthResponse(matched=False, message="too_dark")
      if hint == "too_far":
          return FaceAuthResponse(matched=False, message="too_far")
      if hint == "retry":
          return FaceAuthResponse(matched=False, message="no_face")
      if hint == "spoof":
          security_logger.warning("SPOOF_ENTRY_DETECTED ip=%s", ip)
          db.add(SecurityAlert(
              alert_type="SPOOF_ENTRY",
              user_id=None,
              ip_address=ip,
              snapshot_b64=body.image,
          ))
          db.commit()
          return FaceAuthResponse(matched=False, message="not_recognized")
      # hint == "ok" → proceed

      try:
          live_encoding = encode_face(body.image)
      except RuntimeError as e:
          raise HTTPException(status_code=503, detail=str(e))

      if live_encoding is None:
          return FaceAuthResponse(matched=False, message="no_face")

      now = datetime.now(timezone.utc)
      session_cutoff = now - timedelta(minutes=SESSION_TIMEOUT_MINUTES)

      enrolled_users = db.query(User).filter(User.face_encoding.isnot(None)).all()
      matched_user = find_match(live_encoding, enrolled_users)

      if matched_user is None:
          security_logger.info("FACE_UNRECOGNIZED entry_gate")
          unknown_cutoff = now - timedelta(minutes=1)
          existing = (
              db.query(EntryLog)
              .filter(
                  EntryLog.user_id.is_(None),
                  EntryLog.granted == False,
                  or_(
                      EntryLog.time_out >= unknown_cutoff,
                      and_(EntryLog.time_out.is_(None), EntryLog.accessed_at >= unknown_cutoff),
                  ),
              )
              .order_by(_desc(EntryLog.accessed_at))
              .first()
          )
          if existing:
              existing.time_out = now
          else:
              db.add(EntryLog(
                  user_id=None, entry_type="face_scan",
                  granted=False, note="Unknown visitor",
              ))
          db.commit()
          return FaceAuthResponse(matched=False, message="not_recognized")

      existing = (
          db.query(EntryLog)
          .filter(
              EntryLog.user_id == matched_user.id,
              EntryLog.granted == True,
              or_(
                  EntryLog.time_out >= session_cutoff,
                  and_(EntryLog.time_out.is_(None), EntryLog.accessed_at >= session_cutoff),
              ),
          )
          .order_by(_desc(EntryLog.accessed_at))
          .first()
      )
      if existing:
          existing.time_out = now
      else:
          db.add(EntryLog(
              user_id=matched_user.id, entry_type="face_scan",
              granted=True, note=matched_user.name,
          ))
      db.commit()

      security_logger.info("FACE_ENTRY_SUCCESS user_id=%d name=%s", matched_user.id, matched_user.name)
      return FaceAuthResponse(
          matched=True,
          user_id=matched_user.id,
          name=matched_user.name,
          role=matched_user.role,
          token=_make_token(matched_user.id),
          message="recognized",
      )
  ```

- [ ] **Step 2: Verify the server starts without errors**

  ```bash
  cd backend && python -c "from routers.auth import router; print('auth router OK')"
  ```
  Expected: "auth router OK"

- [ ] **Step 3: Commit**

  ```bash
  git add backend/routers/auth.py
  git commit -m "feat: add liveness check to /auth/face entry gate endpoint"
  ```

---

## Task 6: Wire Liveness into Face Lookup (/api/auth/face-lookup)

**Files:**
- Modify: `backend/routers/auth.py`

- [ ] **Step 1: Add liveness check + alert logging to face_lookup**

  In `backend/routers/auth.py`, replace the `face_lookup` function with:

  ```python
  @router.post("/face-lookup", response_model=FaceLookupResponse)
  @limiter.limit("120/minute")
  def face_lookup(
      request: Request,
      body: FaceAuthRequest,
      _librarian: User = Depends(require_librarian),
      db: Session = Depends(get_db),
  ):
      """
      Called by LibBorrowReturn QuickScanModal.
      Requires librarian JWT. Identifies member — no entry log, no JWT issued.
      """
      from services.face_service import encode_face, find_match
      from services.liveness_service import check_liveness
      from models.security_alert import SecurityAlert
      from models.transaction import Transaction

      ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()

      # ── Liveness check ────────────────────────────────────────────────────────
      hint = check_liveness(body.image)
      if hint == "too_dark":
          return FaceLookupResponse(matched=False, message="too_dark")
      if hint == "too_far":
          return FaceLookupResponse(matched=False, message="too_far")
      if hint == "retry":
          return FaceLookupResponse(matched=False, message="no_face")
      if hint == "spoof":
          security_logger.warning("SPOOF_LOOKUP_DETECTED ip=%s", ip)
          db.add(SecurityAlert(
              alert_type="SPOOF_LOOKUP",
              user_id=None,
              ip_address=ip,
              snapshot_b64=body.image,
          ))
          db.commit()
          return FaceLookupResponse(matched=False, message="not_recognized")
      # hint == "ok" → proceed

      try:
          live_encoding = encode_face(body.image)
      except RuntimeError as e:
          raise HTTPException(status_code=503, detail=str(e))

      if live_encoding is None:
          return FaceLookupResponse(matched=False, message="no_face")

      enrolled_users = db.query(User).filter(User.face_encoding.isnot(None)).all()
      matched_user = find_match(live_encoding, enrolled_users)

      if matched_user is None:
          return FaceLookupResponse(matched=False, message="not_recognized")

      active_loans = db.query(Transaction).filter(
          Transaction.user_id == matched_user.id,
          Transaction.status == "active",
      ).count()

      return FaceLookupResponse(
          matched=True,
          user_id=matched_user.id,
          name=matched_user.name,
          member_id=_member_id(matched_user.id),
          active_loans=active_loans,
          message="recognized",
      )
  ```

- [ ] **Step 2: Verify**

  ```bash
  cd backend && python -c "from routers.auth import router; print('auth router OK')"
  ```
  Expected: "auth router OK"

- [ ] **Step 3: Commit**

  ```bash
  git add backend/routers/auth.py
  git commit -m "feat: add liveness check to /auth/face-lookup borrow/return endpoint"
  ```

---

## Task 7: Wire Liveness into Face Enrollment Endpoints

**Files:**
- Modify: `backend/routers/auth.py` (enroll_face)
- Modify: `backend/routers/librarian.py` (librarian_enroll_face)

- [ ] **Step 1: Add liveness check to enroll_face in auth.py**

  In `backend/routers/auth.py`, replace the `enroll_face` function with:

  ```python
  @router.post("/enroll-face")
  @limiter.limit("10/minute")
  def enroll_face(
      request: Request,
      body: EnrollFaceRequest,
      current_user: User = Depends(get_current_user),
      db: Session = Depends(get_db),
  ):
      from services.face_service import encode_face, find_match
      from services.liveness_service import check_liveness
      from models.security_alert import SecurityAlert

      ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()

      # ── Liveness check ────────────────────────────────────────────────────────
      hint = check_liveness(body.image)
      if hint == "too_dark":
          raise HTTPException(status_code=422, detail="The image is too dark. Try better lighting.")
      if hint == "too_far":
          raise HTTPException(status_code=422, detail="Your face is too far. Move closer to the camera.")
      if hint == "retry":
          raise HTTPException(status_code=422, detail="Could not verify liveness. Please try again.")
      if hint == "spoof":
          security_logger.warning("SPOOF_ENROLL_DETECTED ip=%s user_id=%d", ip, current_user.id)
          db.add(SecurityAlert(
              alert_type="SPOOF_ENROLL",
              user_id=current_user.id,
              ip_address=ip,
              snapshot_b64=body.image,
          ))
          db.commit()
          raise HTTPException(
              status_code=422,
              detail="Could not verify a live face. Please use your device's front camera directly.",
          )
      # hint == "ok" → proceed

      try:
          encoding = encode_face(body.image)
      except RuntimeError as e:
          raise HTTPException(status_code=503, detail=str(e))

      if encoding is None:
          raise HTTPException(status_code=422, detail="No face detected in the image. Please try again with better lighting.")

      other_users = (
          db.query(User)
          .filter(User.face_encoding.isnot(None), User.id != current_user.id)
          .all()
      )
      duplicate = find_match(encoding, other_users, threshold=FACE_ENROLL_DEDUP_THRESHOLD)
      if duplicate is not None:
          raise HTTPException(
              status_code=409,
              detail="This face is already registered to another account. Please contact the librarian if you believe this is an error.",
          )

      import json
      current_user.face_encoding = json.dumps(encoding)
      db.commit()

      return {"success": True, "message": "Face enrolled successfully"}
  ```

- [ ] **Step 2: Add liveness check to librarian_enroll_face in librarian.py**

  In `backend/routers/librarian.py`, replace the `librarian_enroll_face` function with:

  ```python
  @router.post("/users/{user_id}/enroll-face")
  def librarian_enroll_face(
      user_id: int,
      body:    EnrollFaceRequest,
      request: Request = None,
      db:      Session = Depends(get_db),
      _:       User    = Depends(require_librarian),
  ):
      """
      Allows a librarian to enroll (or re-enroll) a face for any member.
      """
      from services.face_service import encode_face, find_match
      from services.liveness_service import check_liveness
      from models.security_alert import SecurityAlert
      from logger import security_logger
      from config import FACE_ENROLL_DEDUP_THRESHOLD
      import json as _json

      member = db.query(User).filter(User.id == user_id, User.role == "member").first()
      if not member:
          raise HTTPException(status_code=404, detail="Member not found")

      ip = "unknown"
      if request:
          ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown").split(",")[0].strip()

      # ── Liveness check ────────────────────────────────────────────────────────
      hint = check_liveness(body.image)
      if hint == "too_dark":
          raise HTTPException(status_code=422, detail="The image is too dark. Try better lighting.")
      if hint == "too_far":
          raise HTTPException(status_code=422, detail="Member's face is too far. Ask them to move closer.")
      if hint == "retry":
          raise HTTPException(status_code=422, detail="Could not verify liveness. Please try again.")
      if hint == "spoof":
          security_logger.warning("SPOOF_ENROLL_DETECTED ip=%s target_user_id=%d", ip, user_id)
          db.add(SecurityAlert(
              alert_type="SPOOF_ENROLL",
              user_id=user_id,
              ip_address=ip,
              snapshot_b64=body.image,
          ))
          db.commit()
          raise HTTPException(
              status_code=422,
              detail="Could not verify a live face. Please use the webcam directly — photos and phone screens are not accepted.",
          )
      # hint == "ok" → proceed

      try:
          encoding = encode_face(body.image)
      except RuntimeError as e:
          raise HTTPException(status_code=503, detail=str(e))

      if encoding is None:
          raise HTTPException(
              status_code=422,
              detail="No face detected in the image. Please try again with better lighting.",
          )

      other_users = (
          db.query(User)
          .filter(User.face_encoding.isnot(None), User.id != user_id)
          .all()
      )
      duplicate = find_match(encoding, other_users, threshold=FACE_ENROLL_DEDUP_THRESHOLD)
      if duplicate is not None:
          raise HTTPException(
              status_code=409,
              detail=f"This face is already registered to another account ({duplicate.name}).",
          )

      member.face_encoding = _json.dumps(encoding)
      db.commit()

      return {"success": True, "message": f"Face enrolled for {member.name}"}
  ```

  Note: `librarian_enroll_face` needs `Request` added to its signature. Add `from fastapi import Request` to the imports at the top of `librarian.py` if not already present.

- [ ] **Step 3: Check Request is imported in librarian.py**

  ```bash
  cd backend && grep "from fastapi import" routers/librarian.py
  ```
  If `Request` is not in the import, update the line to include it:
  ```python
  from fastapi import APIRouter, Depends, HTTPException, Query, Request
  ```

- [ ] **Step 4: Verify both routers load**

  ```bash
  cd backend && python -c "from routers.auth import router; from routers.librarian import router as lr; print('both routers OK')"
  ```
  Expected: "both routers OK"

- [ ] **Step 5: Commit**

  ```bash
  git add backend/routers/auth.py backend/routers/librarian.py
  git commit -m "feat: add liveness check and spoof alert logging to all enrollment endpoints"
  ```

---

## Task 8: Frontend — Alerts API, LibAlerts Page, App Route, LibLayout Badge

**Files:**
- Create: `frontend/src/api/alerts.js`
- Create: `frontend/src/pages/lib/LibAlerts.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/LibLayout.jsx`

- [ ] **Step 1: Create frontend/src/api/alerts.js**

  ```javascript
  import client from './client';

  export const getSecurityAlerts = (unreadOnly = false) =>
    client.get('/api/librarian/security-alerts', { params: { unread_only: unreadOnly } });

  export const getUnreadAlertCount = () =>
    client.get('/api/librarian/security-alerts/unread-count');

  export const markAlertRead = (id) =>
    client.patch(`/api/librarian/security-alerts/${id}/read`);

  export const markAllAlertsRead = () =>
    client.post('/api/librarian/security-alerts/read-all');
  ```

- [ ] **Step 2: Create frontend/src/pages/lib/LibAlerts.jsx**

  ```jsx
  import { useState, useEffect, useCallback } from 'react';
  import { ShieldAlert, CheckCircle, RefreshCw, Eye, EyeOff, AlertTriangle } from 'lucide-react';
  import { getSecurityAlerts, markAlertRead, markAllAlertsRead } from '../../api/alerts';

  const ALERT_LABELS = {
    SPOOF_ENROLL:  { label: 'Spoof — Enrollment',    color: 'rose' },
    SPOOF_ENTRY:   { label: 'Spoof — Entry Gate',     color: 'orange' },
    SPOOF_LOOKUP:  { label: 'Spoof — Borrow/Return',  color: 'amber' },
  };

  const timeAgo = (isoStr) => {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const LibAlerts = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);

    const fetchAlerts = useCallback(async () => {
      try {
        const res = await getSecurityAlerts();
        setAlerts(res.data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

    const handleMarkRead = async (id) => {
      await markAlertRead(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
    };

    const handleMarkAllRead = async () => {
      await markAllAlertsRead();
      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
    };

    const unreadCount = alerts.filter((a) => !a.is_read).length;

    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 px-4 py-8 md:p-10 transition-colors duration-300">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500 mb-1">
                Security
              </p>
              <h1 className="text-3xl sm:text-4xl font-black italic uppercase tracking-tighter leading-none text-slate-900 dark:text-white">
                Spoof <span className="text-rose-500">Alerts</span>
              </h1>
            </div>
            <div className="flex items-center gap-3 mt-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                >
                  <CheckCircle size={13} />
                  Mark all read
                </button>
              )}
              <button
                onClick={fetchAlerts}
                className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {['SPOOF_ENROLL', 'SPOOF_ENTRY', 'SPOOF_LOOKUP'].map((type) => {
              const meta = ALERT_LABELS[type];
              const count = alerts.filter((a) => a.alert_type === type).length;
              return (
                <div key={type} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{meta.label}</p>
                  <p className={`text-3xl font-black text-${meta.color}-500`}>{count}</p>
                </div>
              );
            })}
          </div>

          {/* Alert list */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw size={20} className="animate-spin text-slate-400" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <ShieldAlert size={28} className="text-slate-300 dark:text-slate-600" />
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">No alerts recorded</p>
              </div>
            ) : (
              alerts.map((alert) => {
                const meta = ALERT_LABELS[alert.alert_type] ?? { label: alert.alert_type, color: 'slate' };
                const isExpanded = expandedId === alert.id;
                return (
                  <div
                    key={alert.id}
                    className={`border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors ${
                      alert.is_read ? '' : 'bg-rose-50/40 dark:bg-rose-500/5'
                    }`}
                  >
                    <div className="flex items-start gap-4 px-6 py-4">
                      {/* Unread dot */}
                      <div className={`mt-2 w-2 h-2 rounded-full flex-shrink-0 ${alert.is_read ? 'bg-transparent' : 'bg-rose-500'}`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-${meta.color}-100 dark:bg-${meta.color}-500/15 text-${meta.color}-600 dark:text-${meta.color}-400`}>
                            {meta.label}
                          </span>
                          {alert.user_name && (
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Target: {alert.user_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            {timeAgo(alert.created_at)} · IP: {alert.ip_address ?? '—'}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {alert.snapshot_b64 && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
                            title={isExpanded ? 'Hide image' : 'View captured image'}
                          >
                            {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                        {!alert.is_read && (
                          <button
                            onClick={() => handleMarkRead(alert.id)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all"
                            title="Mark as read"
                          >
                            <CheckCircle size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded snapshot */}
                    {isExpanded && alert.snapshot_b64 && (
                      <div className="px-6 pb-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                          Captured Image (Evidence)
                        </p>
                        <img
                          src={alert.snapshot_b64}
                          alt="Spoof attempt capture"
                          className="max-w-xs rounded-xl border border-slate-200 dark:border-slate-600 shadow"
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  export default LibAlerts;
  ```

- [ ] **Step 3: Add /lib/alerts route to App.jsx**

  In `frontend/src/App.jsx`, add the import:
  ```javascript
  import LibAlerts from './pages/lib/LibAlerts';
  ```

  And inside the `<Route element={<LibLayout />}>` block, add:
  ```jsx
  <Route path="/lib/alerts" element={<LibAlerts />} />
  ```

- [ ] **Step 4: Add Alerts nav link + badge to LibLayout.jsx**

  In `frontend/src/components/LibLayout.jsx`:

  **4a.** Add `ShieldAlert` to the lucide-react import (it's already imported as `ShieldCheck`; add `ShieldAlert` to the same line):
  ```javascript
  import {
    BookOpen, PlusSquare, FileText, Users,
    LogOut, QrCode,
    Menu, X, ChevronRight, Sun, Moon, ShieldCheck,
    AlertTriangle, Bell, BookMarked, ShieldAlert,
  } from 'lucide-react';
  ```

  **4b.** Add the alerts link to `NAV_LINKS` array (add as the last item before the closing bracket):
  ```javascript
  { to: '/lib/alerts', icon: <ShieldAlert size={18} />, label: 'Security Alerts', alertBadge: true },
  ```

  **4c.** Add imports for `getUnreadAlertCount` at the top:
  ```javascript
  import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api/librarian';
  import { getUnreadAlertCount } from '../api/alerts';
  ```

  **4d.** Add alert badge state inside the `LibLayout` component (after `const unreadCount` line):
  ```javascript
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  const fetchAlertCount = useCallback(async () => {
    try {
      const res = await getUnreadAlertCount();
      setUnreadAlerts(res.data.unread_count);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchAlertCount();
    const id = setInterval(fetchAlertCount, 60_000);
    return () => clearInterval(id);
  }, [fetchAlertCount]);
  ```

  **4e.** Update the nav link render in the sidebar to show the badge. Find the section inside `.map()` that renders each `link` and replace it with:
  ```jsx
  {NAV_LINKS.map((link, i) => {
    const active = location.pathname === link.to;
    return (
      <Link
        key={link.to}
        to={link.to}
        onClick={close}
        style={{ animationDelay: `${i * 40}ms` }}
        className={`animate-slide-in-left group flex items-center gap-3 px-4 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all duration-200 relative overflow-hidden ${
          active
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-300/40 dark:shadow-blue-900/50'
            : 'text-blue-900/70 dark:text-slate-400 hover:bg-blue-100 dark:hover:bg-white/10 hover:text-blue-700 dark:hover:text-white hover:translate-x-1'
        }`}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white/60 rounded-full" />
        )}
        <span className={`transition-transform duration-200 group-hover:scale-110 ${active ? 'text-white' : 'text-blue-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400'}`}>
          {link.icon}
        </span>
        <span className="flex-1">{link.label}</span>
        {link.alertBadge && unreadAlerts > 0 && (
          <span className="min-w-[18px] h-[18px] bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 leading-none">
            {unreadAlerts > 99 ? '99+' : unreadAlerts}
          </span>
        )}
        <ChevronRight
          size={12}
          className={`transition-all duration-200 ${active ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-60 group-hover:translate-x-0'}`}
        />
      </Link>
    );
  })}
  ```

- [ ] **Step 5: Verify frontend compiles**

  ```bash
  cd frontend && npm run build 2>&1 | tail -10
  ```
  Expected: build completes with no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/api/alerts.js frontend/src/pages/lib/LibAlerts.jsx frontend/src/App.jsx frontend/src/components/LibLayout.jsx
  git commit -m "feat: add security alerts page, API wrapper, nav badge, and /lib/alerts route"
  ```

---

## Task 9: Frontend — EntryGate Guidance Overlays

**Files:**
- Modify: `frontend/src/pages/lib/EntryGate.jsx`

- [ ] **Step 1: Add too_dark and too_far to the message handler**

  In `frontend/src/pages/lib/EntryGate.jsx`, find the `captureAndSend` function. After the line:
  ```javascript
  if (data.message === 'no_face') return;
  ```

  Add:
  ```javascript
  if (data.message === 'too_dark') {
    const lastSeen = cooldownRef.current['too_dark'] ?? 0;
    if (Date.now() - lastSeen < UNKNOWN_COOLDOWN) return;
    cooldownRef.current['too_dark'] = Date.now();
    showResult({ type: 'too_dark', data: {} });
    return;
  }

  if (data.message === 'too_far') {
    const lastSeen = cooldownRef.current['too_far'] ?? 0;
    if (Date.now() - lastSeen < UNKNOWN_COOLDOWN) return;
    cooldownRef.current['too_far'] = Date.now();
    showResult({ type: 'too_far', data: {} });
    return;
  }
  ```

- [ ] **Step 2: Add the two new overlay renders**

  In the JSX, after the `scanResult?.type === 'not_recognized'` overlay block (around line 264), add:

  ```jsx
  {scanResult?.type === 'too_dark' && (
    <div className="absolute inset-0 z-30 bg-amber-700/92 backdrop-blur-md flex flex-col items-center justify-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-1"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <h2 className="text-3xl font-black uppercase italic tracking-tighter">Too Dark</h2>
      <p className="font-black tracking-[0.3em] uppercase text-[10px] text-amber-200">
        Please move to a brighter area
      </p>
    </div>
  )}

  {scanResult?.type === 'too_far' && (
    <div className="absolute inset-0 z-30 bg-slate-700/92 backdrop-blur-md flex flex-col items-center justify-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-1"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      <h2 className="text-3xl font-black uppercase italic tracking-tighter">Move Closer</h2>
      <p className="font-black tracking-[0.3em] uppercase text-[10px] text-slate-300">
        Step toward the camera
      </p>
    </div>
  )}
  ```

- [ ] **Step 3: Verify frontend compiles**

  ```bash
  cd frontend && npm run build 2>&1 | tail -5
  ```
  Expected: build completes with no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/lib/EntryGate.jsx
  git commit -m "feat: add too_dark and too_far guidance overlays to EntryGate"
  ```

---

## Task 10: Frontend — LibBorrowReturn Face Scan Guidance

**Files:**
- Modify: `frontend/src/pages/lib/LibBorrowReturn.jsx`

- [ ] **Step 1: Update handleFaceScan to check matched flag and handle guidance hints**

  In `frontend/src/pages/lib/LibBorrowReturn.jsx`, replace the `handleFaceScan` function with:

  ```javascript
  const handleFaceScan = async () => {
    if (!webcamRef.current) return;
    setFaceScanning(true);
    setFaceError('');
    try {
      const image = webcamRef.current.getScreenshot();
      if (!image) throw new Error('Could not capture image');
      const res = await faceLookup(image);

      // Handle guidance hints returned as matched=false
      if (!res.data.matched) {
        if (res.data.message === 'too_dark') {
          setFaceError('Too dark — please improve the lighting and try again.');
        } else if (res.data.message === 'too_far') {
          setFaceError('Move closer to the camera and try again.');
        } else if (res.data.message === 'no_face') {
          setFaceError('No face detected. Position the member in front of the camera.');
        } else {
          setFaceError('Face not recognized. Please try again or search by name.');
        }
        return;
      }

      setFoundMember(res.data);
      setFaceFound(true);
      try {
        const resvRes = await getMemberReservations(res.data.user_id);
        setMemberReservations(resvRes.data);
      } catch {
        setMemberReservations([]);
      }
    } catch (err) {
      setFaceError(err.response?.data?.detail || 'Face not recognized. Please try again.');
    } finally {
      setFaceScanning(false);
    }
  };
  ```

- [ ] **Step 2: Verify frontend compiles**

  ```bash
  cd frontend && npm run build 2>&1 | tail -5
  ```
  Expected: build completes with no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/pages/lib/LibBorrowReturn.jsx
  git commit -m "feat: handle liveness guidance hints in borrow/return face scan modal"
  ```

---

## Task 11: End-to-End Smoke Test

- [ ] **Step 1: Start the backend**

  ```bash
  cd backend && python run.py
  ```
  Expected: server starts, logs show "Anti-spoof model loaded" (or a warning if model not downloaded yet).

- [ ] **Step 2: Start the frontend**

  ```bash
  cd frontend && npm run dev
  ```

- [ ] **Step 3: Test entry gate with a dark frame**

  Open `http://localhost:5173/lib/entry`. Cover the camera with your hand or reduce lighting significantly. Expected: amber "Too Dark" overlay appears briefly.

- [ ] **Step 4: Test entry gate with face too far**

  Step back far from the camera. Expected: "Move Closer" overlay appears briefly.

- [ ] **Step 5: Test spoof detection (optional — requires ONNX model)**

  Hold a printed photo or phone screen with a face photo in front of the camera. Expected: no "Access Granted" — silently shows "Not Recognized" after a moment.

- [ ] **Step 6: Verify security alert API**

  ```bash
  # Get a librarian JWT first from login, then:
  curl -H "Authorization: Bearer <token>" http://localhost:8000/api/librarian/security-alerts
  ```
  Expected: JSON array (empty if no spoof attempts yet).

- [ ] **Step 7: Navigate to /lib/alerts**

  Go to `http://localhost:5173/lib/alerts`. Expected: alerts page loads, shows "No alerts recorded" if nothing triggered yet.

- [ ] **Step 8: Final commit**

  ```bash
  git add -A && git commit -m "chore: face anti-spoofing implementation complete"
  ```
