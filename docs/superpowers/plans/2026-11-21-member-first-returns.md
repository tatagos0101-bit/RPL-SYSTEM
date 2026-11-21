# Member-first returns implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and a fresh final review.

**Goal:** Open automatic member facial identification for Return books, then let staff select that member's active loans without scanning a book.

**Architecture:** Reuse `CirculationMember` and the librarian-only member active-loans endpoint, making that GET side-effect free. Normalize each selected loan into the existing review/submission flow with its original transaction/copy/member identifiers. QR/code entry is an explicitly opened fallback. No schema, biometric threshold, reservation confirmation, or circulation confirmation policy changes.

**Tech stack:** Existing React/JSX, Axios, native dialogs, and optional Playwright acceptance scripts.

**Spec:** The November 21 user request: match the borrowing identification flow, show the member's borrowed books, and make book codes/scans a last resort.

## Global constraints

- Face lookup keeps existing PAD, retry, and cancellation behavior; supervised manual member lookup stays available.
- Active/overdue loans are fetched only through the existing librarian API. Lists and scans never submit transactions.
- Review precedes all returns. Preserve exact transaction IDs, original recovery keys, independent item outcomes, and server validation.
- Existing reserved borrowing remains one-click; walk-in borrowing keeps its existing scanner behavior.
- All Return entry points, including transaction/Due Books shortcuts, begin identification rather than pre-submitting or bypassing it.
- Browser plugin is unavailable; use the previously authorized local Playwright fallback with synthetic camera/API data.

## Review focus

- Same-title loans/copies must remain distinct by transaction ID, including legacy copy-less loans.
- A fallback scan inside a selected member's session must not add another member's loan.
- Empty/error/loading loan lists must not open book scanning automatically or claim a failed fetch is empty.
- Switching/closing during inference or loan loading must ignore late responses and release cameras.
- Face/manual preparation, adding/removing items, and review must make no circulation writes.

## Task 1: Member-first return selection

- [x] Update `frontend/tests/circulation_face_browser.cjs` to expect Return books to open the automatic face camera; run and observe the current scanner-first failure.
- [x] Add `frontend/src/components/ReturnBookSelection.jsx`: abortable active-loan loading, refresh, exact-loan Add to return list, explicit optional QR/code fallback, and empty/error/loading feedback.
- [x] Allow request options in `getMemberActiveLoans(userId, options = {})` in `frontend/src/api/librarian.js`.
- [x] Update `CirculationDialog.jsx` to identify a member for either mode, make shortcuts identify first, and guard selected-member fallback scans against cross-member additions. Preserve review/receipt/recovery submission logic.
- [x] Give `CirculationMember.jsx` a mode-specific heading without changing recognition or manual lookup.
- [x] Run the updated face browser checks and inspect desktop/mobile screenshots.

## Task 2: Regression coverage and documentation

- [x] Extend synthetic browser acceptance to cover active/overdue/legacy loans, duplicate selections, wrong-member fallback scans, exact return payloads, failed/empty/retried lists, quick-return identification, camera denial, and cleanup.
- [x] Adapt the existing QR acceptance entry to select the explicit code fallback, preserving mixed-member/legacy/idempotency tests.
- [x] Update `docs/ARCHITECTURE.md` and `docs/QR_CIRCULATION.md` to describe the final flow and acceptance limits.
- [x] Run frontend lint/build/helper tests, relevant existing circulation backend tests, and targeted browser acceptance. Report real-camera recognition as unmeasured.
- [x] Obtain one fresh read-only final review; address consequential findings with focused regression checks.

## Execution record

- Pre-flight: working tree clean at `1955ccf`. Existing active-loans API includes original transaction ID, copy ID, title, due date, fine estimate, and active/overdue status. The initial frontend-only assessment was revised after the final review identified mutation helpers in that GET; no schema change is needed.
- Task 1: face-first browser assertion failed on the original scanner-first Return entry, then passed at 1440/390px after implementation. Member return acceptance passed at both widths, including exact three-loan payloads, legacy/overdue loans, guarded QR fallback, empty/error/refresh states and transaction-log shortcut.
- Task 2: 109 frontend helper tests, frontend lint/build, 9 focused backend tests and the adapted Python QR browser acceptance passed. A default pytest temporary-folder ACL failure was resolved by a fresh isolated `--basetemp`; no application change was needed for that test-runner issue.
- Final review found that the reused active-loans GET updated overdue statuses and reconciled copies across the catalog. Expanded the regression to snapshot persisted loan/status/copy fields and another member's assignable legacy loan; observed failure before the fix. Removed both mutation helpers from that GET and derive overdue response status through the Philippine-time helper. The 9-test focused suite then passed. No confirmation safeguards changed.
- Declined live-camera accuracy remains unmeasured: browser frames/API replies are synthetic, so no recognition/PAD accuracy claim is made.
- Built-CSP test initially rejected the local build's development API URL as intended. Rebuild the QA bundle with command-scoped `VITE_API_URL=/`; do not weaken the production CSP or edit environment files.
- Built-bundle return acceptance passed at 1440/390px, including both transaction-log and Due Books shortcuts. Python QR acceptance passed with the repository's production CSP at both widths.
- Full backend run: 476 passed, 32 skipped, one stale authentication-test expectation failed because it expected a librarian to access member-only notifications. Corrected that test to use the librarian notification endpoint and explicitly retain the wrong-role 403 assertion; authentication product code is unchanged.
- Final full backend run: **477 passed, 32 skipped**, 15 existing warnings. Frontend: **109 helper tests passed**, lint/build/credential scan passed. Both Node browser scripts and the Python QR script passed at desktop/phone sizes; the QR script also passed against the built bundle with the repository CSP. The review's one consequential finding is covered by the failing-then-passing persisted-state regression and the full suite.
- Rollout: publish the read-only backend before the new automatic Return selection screen. This avoids exposing automatic list loading while the older endpoint still performs copy reconciliation. Local development servers were restarted only after confirming isolated SQLite and local storage.
