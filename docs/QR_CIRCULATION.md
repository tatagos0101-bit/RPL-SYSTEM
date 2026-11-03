# QR circulation

Implemented locally on October 31, 2026; this document does not establish production deployment or physical-device acceptance.

## Counter workflow

- Open **Borrow / Return → Quick Scan Session**.
- **Borrow Books**: identify the member using supervised Manual ID or existing face recognition. Scan library copy labels, review the list, then **Confirm Borrowing**.
- **Return Books**: scan immediately, without identifying a member first. The list can contain different members' loans. Review the borrower, copy, due date and estimated fine, then **Confirm Returns**. The server supplies the final fine and return time.
- A camera detection, USB scanner input followed by Enter, or typed code uses the same lookup. Scanning never records a transaction. Remove unwanted items before confirmation.
- Each item is submitted separately. Confirmed items remain confirmed if a later item fails. Unsubmitted items are explicitly marked.
- Legacy title QR codes still work. If multiple copies/loans match, staff must select one explicitly. ISBNs are not physical-copy identifiers. Missing physical-copy setup must be repaired through inventory/migration procedures, never by the scan endpoint.
- **Outcome unknown** stops the remaining submissions. Use **Check outcome** or **Retry original request**. Recovery survives reload for the same librarian account; it does not run automatically. Do not clear browser recovery storage to work around an unresolved request.

The transaction log and Due Books return buttons open the same review dialog with an exact loan. Older API clients without an idempotency header retain their legacy contract; they do not receive the new retry guarantee.

## Implementation boundaries

- [CirculationDialog](../frontend/src/components/CirculationDialog.jsx) manages review, sequential writes and recovery. [CirculationMember](../frontend/src/components/CirculationMember.jsx) reuses the existing face/manual lookup APIs. No recognition or PAD thresholds changed.
- [QrScanner](../frontend/src/components/QrScanner.jsx) lazily loads pinned `@zxing/browser` 0.1.5. [Camera ownership](../frontend/src/api/qrCamera.js) stops streams even if camera permission resolves after cancellation. Camera selection, dialog/step cleanup and hidden-page cleanup release streams; return to the page and explicitly start again. QR frames never leave the browser.
- USB/manual entry remains available after permission or camera failures. One lookup runs at a time; detections while busy or while selecting an ambiguous legacy code are ignored. Repeat queued copies are ignored. Staff must rescan ignored input once the current lookup/selection finishes.
- [Transaction routes](../backend/routers/transactions.py) expose librarian-only `GET /api/transactions/scan?code=...&mode=borrow|return` and `GET /api/transactions/write-requests/{uuid}`. Scanning performs no backfills or loan-status writes. Public catalog endpoints do not expose borrowers.
- `POST /api/transactions/borrow|return` accepts `Idempotency-Key`. A keyed return requires `transaction_id`; user/book/copy (when provided) and active status are rechecked under locks. A stale request cannot close a subsequent loan of the same copy.
- Existing `inventory_writes` stores librarian-scoped fingerprints and successful response receipts. The receipt and loan/inventory/reservation changes commit together. Conflicting payloads return 409. Receipts are server-side private data. No table or migration was added.
- Lock order for keyed circulation is librarian → member → book → loan. Preserve helper `commit=False` behavior. Existing overdue, five-book quota, reservation priority and history rules remain authoritative at confirmation.
- [Recovery helpers](../frontend/src/api/circulationRecovery.js) persist only request/operation and member/book/copy/loan IDs, under an account-specific key. They do not persist names, images, credentials or viewing URLs. A missing receipt after a timeout is **not** proof of failure: retry only with the original key and payload.
- No durable offline processing, automatic replay, photo-evidence storage or new biometric policy is introduced. Existing CSP is unchanged; no remote decoder scripts or workers are used.

## Verification

From the repository root, use the commands in [AGENTS.md](../AGENTS.md). Focused backend tests are `backend/tests/test_circulation_scanning.py`; helper/camera tests are `frontend/src/api/circulationRecovery.test.js`.

For PostgreSQL, use an **empty disposable localhost** database named `rpl_qr_test`, set `CIRCULATION_TEST_DATABASE_URL` privately, and run:

```text
uv run --project backend --with pytest python -m pytest backend/tests/test_circulation_postgres.py -q -p no:cacheprovider
```

The opt-in test creates and drops its test schema. It refuses non-localhost/differently named databases and refuses an existing schema. Never point it at a working library database. It covers concurrent same-key retries, competing librarians/copies, duplicate returns and a delayed old-loan return after reborrowing.

For browser checks, Python Playwright, qrcode and an installed Edge browser are required separately. Run a local Vite dev server on port 5187, then `python frontend/tests/circulation_browser.py`. The script uses only synthetic records and mocked API responses. Screenshots default to ignored `.tools/qr-browser/`.

To check the production bundle with the current deployment CSP, build, preview on localhost port 5190, set `QR_BROWSER_BASE=http://127.0.0.1:5190` and `QR_BROWSER_CSP=true`, then run that script. It injects the repository's CSP into local HTML responses. No deployed service is contacted. This validates desktop/mobile layouts, actual bundled QR decoding from a synthetic video stream, face-to-QR camera release, camera switching/hiding/review, mixed-member returns, legacy choice, duplicate input and same-key recovery after reload.

## Rollout and outstanding acceptance

No new runtime variables or database schema changes are required, assuming the existing `inventory_writes` table and server-only grants are already provisioned. This is a code/package-lock change. After separate deployment approval, release the compatible backend endpoints before the new frontend and verify the deployed version and access boundaries.

Before counter use, trial printed production-format library labels with the actual webcam/phone and intended USB scanner: lighting, focus, rear-camera selection, rapid Enter-terminated input, permission denial, closing/switching cameras and reconnecting after a lost response. Use designated test members/books in an isolated environment. Synthetic browser tests do not certify physical recognition/scanning accuracy, mobile Safari behavior, production PostgreSQL policies or real network conditions.
