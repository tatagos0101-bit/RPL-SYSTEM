# Face Anti-Spoofing Design

**Date:** 2026-04-07  
**Status:** Approved  
**Scope:** All face recognition endpoints — entry gate, borrow/return lookup, face enrollment

---

## Problem

The current face recognition system accepts any base64 image containing a face. An attacker can hold up a printed photo or a phone screen showing a stolen face photo and be granted access. There is no liveness check.

---

## Goal

Add passive liveness detection that:
- Works hands-free (no interaction required from the person)
- Gives helpful guidance when image quality is poor (dark, too far)
- Silently retries when uncertain
- Never tells an attacker they were caught at the entry gate
- Logs a security alert with evidence when a spoof attempt is detected during enrollment

---

## Architecture

A single new service `backend/services/liveness_service.py` runs before `encode_face()` on every face endpoint. It returns a hint string that each endpoint acts on independently.

### Liveness Check Flow

```
b64_image
  → decode to numpy RGB array
  → detect face bounding box (reuse face_recognition.face_locations)
  → quality checks (brightness, face size)  → hint if failing
  → crop face region + resize to 80×80
  → run MiniFASNet ONNX inference
  → threshold score → real / spoof / uncertain
  → return hint: "ok" | "too_dark" | "too_far" | "retry" | "spoof"
```

### Hint Definitions

| Hint | Meaning |
|---|---|
| `ok` | Live face detected, proceed to recognition |
| `too_dark` | Frame brightness below threshold |
| `too_far` | Face bounding box too small (person too far from camera) |
| `retry` | Liveness score uncertain — skip this frame silently |
| `spoof` | Model confident this is a 2D presentation attack |

---

## Model

**MiniFASNet** — a lightweight model (~1MB ONNX) purpose-built for 2D presentation attack detection (printed photos, phone/tablet screens). Runs via `onnxruntime` (CPU inference, ~50–150ms on a regular PC).

**Storage:** `backend/models/anti_spoof.onnx` — gitignored, downloaded on first setup.

**Fallback:** If the model file is missing, `liveness_service.py` returns `"ok"` for every frame and logs a warning. The system degrades gracefully to today's behavior rather than crashing.

**Setup script:** `backend/download_models.py` — one-time download of the ONNX model file.

---

## New Dependencies

- `onnxruntime` — ONNX model inference (CPU-only, no PyTorch needed)
- `opencv-python-headless` — already installed

No new frontend dependencies.

---

## Endpoint Behavior

### `/api/auth/face` — Entry Gate

| Hint | Response |
|---|---|
| `ok` | Proceed to face recognition as today |
| `too_dark` | `FaceAuthResponse(matched=False, message="too_dark")` |
| `too_far` | `FaceAuthResponse(matched=False, message="too_far")` |
| `retry` | `FaceAuthResponse(matched=False, message="no_face")` — silent |
| `spoof` | `FaceAuthResponse(matched=False, message="not_recognized")` + log `SPOOF_ENTRY` alert |

Attacker sees the same "Not Recognized" response whether the face is unregistered or spoofed — no information leakage.

### `/api/auth/face-lookup` — Borrow/Return (librarian modal)

Same hint → response mapping as entry gate. Spoof logs a `SPOOF_LOOKUP` alert.

### `/api/auth/enroll-face` — Face Registration

| Hint | Response |
|---|---|
| `ok` | Proceed to enrollment as today |
| `too_dark` | HTTP 422: "The image is too dark. Try better lighting." |
| `too_far` | HTTP 422: "Your face is too far. Move closer to the camera." |
| `retry` | HTTP 422: "Could not verify liveness. Please try again." |
| `spoof` | HTTP 422: "Could not verify a live face. Please use your device's front camera directly." + log `SPOOF_ENROLL` alert with snapshot |

---

## Security Alert System

### New DB Model: `SecurityAlert`

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `alert_type` | str | `SPOOF_ENROLL`, `SPOOF_ENTRY`, `SPOOF_LOOKUP` |
| `user_id` | int FK → users | Nullable. Set for enrollment (JWT known), null for gate/lookup |
| `ip_address` | str | |
| `snapshot_b64` | text | Nullable. The spoof image saved as evidence |
| `created_at` | datetime | UTC |
| `is_read` | bool | Default False |

### New Endpoints

- `GET /api/librarian/security-alerts` — returns unread alerts, newest first (librarian JWT required)
- `PATCH /api/librarian/security-alerts/{id}/read` — mark single alert as read
- `PATCH /api/librarian/security-alerts/read-all` — mark all as read

### Alert Creation Rules

- `SPOOF_ENROLL` — triggered on `/enroll-face`. `user_id` set (from JWT). Snapshot saved.
- `SPOOF_ENTRY` — triggered on `/auth/face`. `user_id` null. Snapshot saved.
- `SPOOF_LOOKUP` — triggered on `/face-lookup`. `user_id` null. Snapshot saved.

---

## Frontend Changes

### Entry Gate (`EntryGate.jsx`)

Two new brief overlays using the existing cooldown/hold-time pattern:

- `too_dark` → amber overlay: "Too Dark — Move to a brighter area"
- `too_far` → blue-gray overlay: "Move Closer — Step toward the camera"

Spoof → falls through to existing "Not Recognized" overlay. No new overlay for spoof (attacker must not be informed).

### Face Enrollment (User Profile)

Existing error display updated with specific messages per hint:
- `too_dark` → "The image is too dark. Try better lighting."
- `too_far` → "Your face is too far. Move closer to the camera."
- `spoof` → "Could not verify a live face. Please use your device's front camera directly."

### Librarian Dashboard — Alerts

- Sidebar nav item gains a red dot badge showing unread alert count (polled on dashboard load)
- New page `/lib/alerts` listing alerts with: type label, timestamp, IP address, spoof image thumbnail
- "Mark as read" per alert; "Mark all read" bulk action
- Alert count fetched from `GET /api/librarian/security-alerts`

---

## File Changes Summary

### New Files
- `backend/services/liveness_service.py` — quality checks + MiniFASNet inference
- `backend/models/security_alert.py` — SQLAlchemy ORM model
- `backend/routers/alerts.py` — security alert endpoints
- `backend/schemas/alerts.py` — Pydantic schemas
- `backend/download_models.py` — one-time ONNX model download script
- `frontend/src/pages/lib/LibAlerts.jsx` — alerts page
- `frontend/src/api/alerts.js` — alerts API wrapper

### Modified Files
- `backend/routers/auth.py` — call `check_liveness()` in all 3 face endpoints
- `backend/main.py` — register alerts router
- `backend/database.py` — `SecurityAlert` included in `init_db()`
- `frontend/src/App.jsx` — add `/lib/alerts` route
- `frontend/src/pages/lib/EntryGate.jsx` — handle `too_dark` / `too_far` messages
- `frontend/src/pages/user/UserProfile.jsx` — specific enrollment error messages
- `frontend/src/pages/lib/LibLayout.jsx` (or sidebar component) — unread alert badge

---

## Quality Check Thresholds (tunable via config)

| Parameter | Default | Notes |
|---|---|---|
| `LIVENESS_BRIGHTNESS_MIN` | `40` | Mean pixel brightness (0–255). Below = too dark |
| `LIVENESS_FACE_MIN_SIZE` | `80` | Minimum face bounding box height in pixels |
| `LIVENESS_SPOOF_THRESHOLD` | `0.6` | MiniFASNet score above this = real; below = spoof |
| `LIVENESS_UNCERTAIN_BAND` | `0.15` | Score within this band of threshold = uncertain → retry |

These will be added to `config.py` and readable from `.env`.
