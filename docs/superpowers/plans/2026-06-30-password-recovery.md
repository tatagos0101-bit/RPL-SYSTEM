# Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add password recovery through verified email/phone reset codes plus librarian-assisted temporary password reset for members without recovery contacts.

**Architecture:** Backend owns reset-code creation, hashing, expiry, and password changes. Frontend adds a forgot-password page and a librarian reset action, reusing existing temporary-password and must-change-password behavior.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, Vite, Node `node:test`.

## Global Constraints

- No external email or SMS provider is added in this phase.
- Development responses may include `debug_code`; production responses must not.
- Members without email/phone remain valid accounts and use librarian-assisted reset.
- Librarian reset must generate a unique temporary password and set `must_change_password = true`.
- Self-service reset must require a valid, unexpired code.

---

### Task 1: Backend Recovery Model And Endpoints

**Files:**
- Create: `backend/models/password_reset.py`
- Create: `backend/services/password_reset.py`
- Modify: `backend/models/user.py`
- Modify: `backend/database.py`
- Modify: `backend/migrate.py`
- Modify: `backend/schemas/auth.py`
- Modify: `backend/routers/auth.py`
- Modify: `backend/routers/librarian.py`
- Test: `backend/tests/test_password_recovery.py`

**Interfaces:**
- Produces: `create_password_reset_code(db, user, channel) -> tuple[str, PasswordResetCode]`
- Produces: `verify_password_reset_code(db, identifier, code) -> User`
- Produces API: `POST /api/auth/password-reset/request`
- Produces API: `POST /api/auth/password-reset/confirm`
- Produces API: `POST /api/librarian/users/{user_id}/reset-password`

- [ ] Write failing tests for self-service reset, no-contact fallback, and librarian reset.
- [ ] Run `backend/.venv/Scripts/pytest.exe backend/tests/test_password_recovery.py -q` and verify it fails.
- [ ] Implement models, schemas, service, routes, and migrations.
- [ ] Run targeted backend tests until they pass.

### Task 2: Frontend Recovery UI

**Files:**
- Modify: `frontend/src/api/auth.js`
- Modify: `frontend/src/api/librarian.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/public/LoginPage.jsx`
- Create: `frontend/src/pages/public/ForgotPasswordPage.jsx`
- Modify: `frontend/src/pages/lib/LibUsers.jsx`
- Test: `frontend/src/api/passwordRecovery.test.js`

**Interfaces:**
- Produces: `requestPasswordReset(identifier, channel)`
- Produces: `confirmPasswordReset(identifier, code, newPassword)`
- Produces: `resetMemberPassword(userId)`

- [ ] Write failing frontend API shape tests.
- [ ] Run `node --test src/api/passwordRecovery.test.js` and verify it fails.
- [ ] Add API methods and route.
- [ ] Add forgot-password page and login link.
- [ ] Add librarian reset action and temporary-password display.
- [ ] Run frontend tests, lint, and build.

### Task 3: Verification

**Files:**
- Verify backend and frontend.

- [ ] Run `backend/.venv/Scripts/pytest.exe backend/tests -q`.
- [ ] Run `node --test src/api/*.test.js` from `frontend`.
- [ ] Run `npm.cmd run lint` from `frontend`.
- [ ] Run `npm.cmd run build` from `frontend`.
- [ ] Restart backend if the running server lacks auto-reload.
