# Direct Add to list for ready reservations

Completed locally on November16, 2026. Ready reserved titles now select the first validated available physical copy automatically (the existing server lookup orders by copy number). Staff can click Add to list immediately without entering/scanning a code or opening a selector. The selected copy is visible, Change copy is optional for multiple copies, and the borrow pending/review list displays its exact label. Selection is read-only; original Review/Confirm, exact copy_id, server policy/locks and account-scoped idempotent recovery remain authoritative. Queued/unavailable/error/loading states cannot add unverified copies. No exclusive physical allocation is implied.

Before the change, a synthetic browser probe confirmed Add disabled=true, one required selector and zero loan writes. Afterward:

- **9 circulation browser flows passed** with synthetic librarian/member/copy fixtures: desktop/mobile immediate Add and exact confirmed payload; multiple-copy default/filtering and optional override; unavailable refresh and duplicate click; copy error/retry; loading; stale-copy409 without substitution; walk-in scanner; reservation failure with optional scanner. No writes occur before confirmation. Explicit pending-book scanner lookup is absent.
- **2 additional layout/guard checks passed** on desktop and390px mobile: enabled44px Add button, no default combobox, no queued-book Add, and no dialog horizontal overflow. Screenshots of direct selection and review were visually inspected.
- Browser plugin unavailable; used the existing installed local Chrome/Playwright with all API calls mocked. No real patron images/records, credentials, biometric data or physical camera trials were used.
- **98 frontend helper tests passed**, including existing reservation-copy filtering, camera/recovery and exact-copy helpers: `node --test frontend/src/api/*.test.js`.
- **20 targeted backend tests passed**: test_circulation_scanning.py, test_circulation_atomicity.py, test_reservation_policy.py and test_repair_reservations.py. Isolated SQLite/synthetic fixtures only, via the existing test runner, unique task basetemp, tb/capture disabled and no migrations against the running library database.
- Scoped ESLint passed for BorrowBookSelection.jsx and CirculationDialog.jsx. Frontend build passed, including the existing credential check across79 built files.
- Source guards confirm10 circulation identity/add/scan/write/recovery handlers and all existing lookup/dialog cleanup effects are unchanged. **12 protected baseline files are unchanged**, including backend routes/policies/copy services, copy-filter/recovery APIs, member identification, scanner and manifests. Only2 frontend components and2 factual documentation files changed among the16 baseline files.
- Fresh read-only source review reported no actionable findings.

No dependencies, schema, backend logic, production access, migrations, commits, pushes or deployment changed. Frontend HMR loads the update; no backend restart is required. Existing profile/name/photo and catalog/navigation work remains in place. Local website/API health checks are recorded with task evidence. SQLite/mocked browser coverage does not certify PostgreSQL concurrency, real labels/cameras/scanners or production policies.

Evidence and scoped baseline copies are under `.tools/reserved-pickup-button/`. Temporary pytest data is cleaned only after checking native Windows target paths/reparse points, preserving unrelated work and ACLs.
