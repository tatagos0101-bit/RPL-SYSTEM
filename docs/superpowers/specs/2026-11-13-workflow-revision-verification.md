# Workspace and circulation revision verification

Started November 13, paused at the user's request, resumed and completed locally November 16, 2026. The user requested that localhost run first; both servers were started and checked before the remaining implementation. No production database, deployment, commit, push, dependency upgrade or real patron/biometric data was used.

## Implemented behavior

- Librarian navigation starts closed and inert on desktop and mobile. Original menu, close, overlay and navigation controls remain.
- Member pages use walnut/amber, warm-paper light mode and local Newsreader/DM Sans typography. Existing layouts, routes and controls remain. Inventory columns have sufficient width, readable wrapping and an accessible horizontal scroll region on narrow screens.
- Add Book replaces acquisition-entry fields with an optional editable, public catalog description. ISBN metadata can supply an explicitly chosen online summary; manual text remains available when lookup fails or has no summary. Bulk ISBN rows and optional workbook Description values are supported. Acquisition records, imports and inventory actions remain supported.
- Separate Borrow books and Return books buttons launch the existing circulation dialog. Identified borrowers automatically see ready/pending reservations. Ready titles allow exact physical-copy selection without scanning; queued reservations cannot be picked up. QR/USB/manual-code lookup remains optional for pickups and defaults for walk-ins without active reservations.
- Reserved and scanned selections share the original review, submission, per-item result and recovery flow. Failed reservation loads show retry and optional scanning. The manual QR field now reflows at 320px with doubled text.

## Source preservation and tests

This archive has no `.git`; `git status --short` reports that it is not a Git repository. Thirty-four relevant pre-change source copies/hashes were retained under `.tools/workflow-revision/baseline/` instead of overwriting unrelated work.

- AST comparisons passed for **113 original functions**, original member/inventory effect/memo/callback hooks and event bindings. Circulation payload construction, confirmation, recovery, scan handling and account checks remain unchanged. Existing API helpers remain unchanged except optional cancellation arguments for reservation/copy reads.
- **14 protected file hashes** matched the baseline, including the QR scanner, member identification, recovery and inventory-write helpers, member Reservations, public/login styles, package manifests, backend transaction/catalog/member routes and migration entry point. This is evidence only for the saved baseline files, not a claim about unrecorded files.
- Scoped ESLint passed for all **17** changed/new JSX/JS/test files.
- `node --test frontend/src/api/*.test.js`: **89 passed, 0 failed**. New tests cover provider-summary normalization/length/fallback and reservation/copy filtering, identity, queued/expired records and duplicate cart items.
- Installed backend-venv pytest across `backend/tests`: **373 passed, 32 skipped**, with 14 existing deprecation warnings. The 13 new description cases cover persistence/clearing/public output, validation and role/status restrictions, old receipt replay, changed-description conflicts, repeated old-schema upgrades and optional workbook fields.
- The first full backend run had 13 kiosk failures because the runner inherited a configured local station PIN while those fixtures expect the documented development default. The successful rerun set `ENTRY_STATION_PIN=1234` only in the test process; no application PIN or environment file was changed. A temporary runner disabled pytest's optional current-directory symlink to avoid Windows symlink stalls. Fixtures still used isolated SQLite and temporary uploads.
- Final `npm --prefix frontend run build`: **passed**, including its bundled credential scan (**78 files**). No dependencies or manifests changed.

Baseline browser assertions first demonstrated the persistent desktop sidebar, letter-wrapped inventory headers/actions and old Quick Scan entry. Description tests initially failed against the absent schema/output, then passed after implementation. Later browser checks caught a stale online-summary choice after a failed lookup and the enlarged QR input overflow; both were fixed and the affected checks rerun.

## Browser checks actually run

The built-in browser host was unavailable, including on the November 16 retry. Checks used installed Chrome with the existing local Playwright setup, fresh contexts and intercepted API/provider responses containing only synthetic books, accounts, reservations and transactions. Test writes never reached the running backend. Images used no real patron data or camera hardware.

1. Closed/open/closed sidebar state and inertness on desktop; inventory headers, status pills, actions and page bounds at 1536, 1024, 820, 390 and 320px with 16px/32px root text.
2. Member Home, Browse, Reservations and Profile in both themes; original theme-toggle persistence through in-app navigation, mobile drawer controls and no page overflow at 390px. Catalog screenshots wait for the existing entry animation to finish.
3. Automatic ready/pending reservation list, exact available-copy choice and no writes before explicit review/confirmation; original borrow payload and request-key shape.
4. No-reservation walk-in lookup, direct Return launch, failed reservation load/retry, missing title codes, no available copies, wrong-book candidates and lookup errors.
5. Reserved and scanned copies share one list; an unknown first outcome stops the remaining batch and retains the original recovery request.
6. Online summary is an explicit choice and preserves manual text; failed later lookup clears stale suggestions. Public/member details render script-like descriptions as text, without script nodes.
7. Bulk descriptions are editable before import, sent without new acquisition UI fields and locked after import. Saved legacy manual/ISBN requests replay their original payloads and keys; pending ISBN descriptions remain locked.
8. Synthetic canvas camera tracks end when optional scanning is hidden, review begins or the dialog closes. Escape closes the circulation dialog and restores body scrolling. Quick Return preserves the exact original transaction ID.
9. Reserved selection and default walk-in QR entry reflow at 320px/200% text. Delayed reservation and copy requests abort when the dialog closes; stale responses cannot replace a new selection.

Synthetic evidence is retained under `.tools/workflow-revision/art/`: baseline views and final inventory, member light/dark pages, Add Book, reserved pickup and mobile dialog captures. Representative final images were visually inspected for alignment, theme, fields and readable controls. Temporary browser runners and accessible task-only pytest artifacts were removed after recording results. Four task-only pytest directories remain because Windows denied inspection/removal; their permissions were left unchanged. Baseline source copies, screenshots and result/source-hash ledgers were retained.

## Schema and local runtime

`Book.description` is nullable TEXT. The existing additive schema service upgrades old rows without rewriting physical-copy identities or existing descriptions; repeated SQLite execution and PostgreSQL column DDL compilation passed. Empty/omitted create descriptions are excluded from the new receipt fingerprint so pre-upgrade requests replay correctly; changing a nonempty description still conflicts on a reused key.

Before startup, configuration was checked without exposing values: development environment, local storage and the exact isolated SQLite file `backend/rizal_library.local.db`. Only the necessary description addition was applied through the existing schema service and repeated. The general migration entry point's unrelated legacy backfills were not run. Routine server startup uses `AUTO_MIGRATE=false`. See the [deployment description upgrade](../../DEPLOYMENT.md#book-description-upgrade) before releasing elsewhere.

Local endpoints were checked for HTTP 200: frontend `/`, librarian Home and Borrow/Return routes, backend `/health` and the public catalog API. Both servers are left running at `http://localhost:5173` and `http://localhost:8000`.

## Review and limits

The required builder check found no outstanding spec issues. A fresh code reviewer found no material findings in the completed implementation, including legacy receipt compatibility, cancellation and shared circulation/recovery behavior. A follow-up review of the narrow QR reflow CSS also found no material findings. The reviewer performed source review; browser/test results above were run by the implementer.

The skipped environment-dependent tests do not establish live PostgreSQL locking/migration behavior, production grants or live Storage policy. Camera cleanup used synthetic MediaStreams; physical QR/face/PAD accuracy and hardware acceptance were not tested. No deployment or production migration is implied by these local results.
