# Rizal Provincial Library: agent instructions

## Start here

- Read `git status --short` before editing; preserve unrelated and uncommitted work.
- Read relevant source and tests before proposing changes. Code/configuration establish current behavior;
  requirements and `docs/superpowers/` plans are not evidence that a feature exists.
- Use [architecture and known gaps](docs/ARCHITECTURE.md), [setup](README.md), and
  [deployment documentation](docs/DEPLOYMENT.md). Recheck facts when the implementation changes.
- Keep changes within the user's requested scope. Do not implement missing features as incidental cleanup.

## Architecture and conventions

- Frontend: React/JSX, Vite, Tailwind, React Router, and Axios. Backend: FastAPI,
  Pydantic schemas, SQLAlchemy models/services, and Python 3.11–3.12.
- Production targets Supabase PostgreSQL and Storage; FastAPI owns authentication and authorization.
  Do not introduce Supabase Auth or direct browser table access without an agreed architecture change.
- Keep frontend requests/helpers in `frontend/src/api/`; reuse the Axios client, URL helpers,
  role routing, layouts, and shared components. Follow functional components and existing hook patterns.
- Keep backend routes, schemas, models, and domain services in their existing directories.
  Reuse dependency-based access checks and policy services instead of duplicating business rules.
- Match nearby formatting, JavaScript camelCase/PascalCase and Python snake_case conventions.
  Avoid unrelated reformatting, new tooling, or converting the project to TypeScript.
- Use `backend/timezone_utils.py` and frontend date helpers for library dates; account for
  PostgreSQL timezone-aware values and legacy timezone-less Philippine-time values.
- Dependency changes must account for both Python dependency manifests, the relevant lockfile,
  and Docker/Vercel differences. Do not hand-edit lockfiles or silently upgrade dependencies.

## Development and checks

Use the existing setup documentation; do not overwrite an existing environment file.
The README recommends Python 3.12 and Node.js 22.12 or newer. Commands require installed tooling/dependencies.

| Purpose | Working directory | Command |
| --- | --- | --- |
| Frontend development | Repository root | `npm --prefix frontend run dev` |
| Backend development | `backend/` | `uv run python run.py` |
| Frontend build | Repository root | `npm --prefix frontend run build` |
| Frontend lint | Repository root | `npm --prefix frontend run lint` |
| Frontend tests | Repository root | `node --test frontend/src/api/*.test.js` |
| Backend tests | Repository root | `uv run --project backend --with pytest python -m pytest backend/tests -q -p no:cacheprovider` |
| Built frontend preview | Repository root | `npm --prefix frontend run preview` |

- There is no frontend `npm test` script or configured backend lint command. Do not invent them.
- Before starting the backend, confirm an isolated development target: startup can migrate when
  `AUTO_MIGRATE=true`. A development server must not use production database/storage credentials.
- Backend fixtures use isolated SQLite and temporary uploads; cloud integration tests mock Storage.
  They do not establish PostgreSQL locking, live cloud policy, or real-camera accuracy.
- Run relevant existing regression tests for behavior changes; add focused coverage for new risks.
  Frontend helper tests do not replace browser checks for changed routing, camera, or UI behavior.
- For documentation-only edits, check factual accuracy, links, and scoped diffs; do not rerun
  application suites solely for prose changes. Report unavailable or skipped checks honestly.

## Database and migrations

- Preserve foreign keys, unique member/copy identifiers, loan history, and inventory consistency.
  Do not delete or reuse retired physical-copy QR identities to resize stock.
- Initial SQL under `supabase/migrations/` provisions an empty database. Subsequent upgrades use
  `backend/migrate.py` and `backend/services/schema_migrations.py`, including data backfills.
- `python migrate.py` from `backend/` changes the configured database; it is not a read-only check.
  Validate changes on an explicitly isolated database, including repeat execution and existing rows.
- Do not regenerate an applied initial schema as an upgrade. The schema generator overwrites the
  initial SQL file; additive column upgrades do not automatically reconcile every index/constraint.
- Keep production `AUTO_MIGRATE=false`; preserve PostgreSQL TLS/pooler settings, RLS, and revoked
  browser-role table access. SQLite tests alone cannot validate PostgreSQL migration behavior.
- Review transaction boundaries and helper commits before changing inventory, loans, or reservations.
  Existing borrow/return duplicate checks are not a concurrency or idempotency guarantee.

## Authentication and authorization

- Enforce access on the server with current-user/librarian dependencies and resource ownership.
  Frontend role guards and local-storage metadata are not authorization boundaries.
- Stored account roles are `member` and `librarian`; public browsing does not require a guest account.
- Preserve bcrypt hashing, JWT validation, suspended-account rejection, HttpOnly cookies,
  production Secure/SameSite behavior, and intentional legacy bearer compatibility.
- Keep the station PIN separate from account login. Kiosk scans must not issue login tokens/cookies.
- Librarian Settings can replace the station PIN after password confirmation. Preserve database-PIN
  precedence over the environment fallback, per-request verification, and hash-only storage; never return
  PINs/digests. JWT secret rotation requires setting the PIN again; see deployment documentation.
- Preserve first-login password-change routing, but do not claim the backend dependency globally
  enforces `must_change_password`; it currently does not.
- Keep recovery errors non-enumerating and reset codes out of non-test responses/logs.
  Email/SMS recovery delivery is not integrated; librarian-assisted resets are the operational path.
- Verify anonymous, wrong-role, suspended, and cross-owner access when changing protected behavior.

## Facial recognition and biometric privacy

- Distinguish dlib recognition, optional InsightFace, and presentation-attack detection (PAD).
  Preserve legacy encoding compatibility, matching thresholds/margins, and enrollment deduplication.
- Never print, commit, or copy real patron images, embeddings, IDs, or spoof snapshots into
  fixtures, documentation, screenshots, summaries, or external services. Use synthetic test data.
- Spoof alerts can retain raw snapshots; embeddings are stored as JSON text. Do not describe them
  as anonymous data or claim that application-level encryption, consent, or retention controls exist.
- When adding PAD, fail closed for failed/uncertain/unavailable checks before recognition/access/enrollment.
  Preserve password and supervised manual-ID alternatives; do not lower thresholds to make a demo pass.
- Main currently uses brightness/texture heuristics; static photos can pass. MiniFASNet PAD work
  inspected on October 14, 2026 remains separate, uncommitted work with hardware acceptance pending.
  Require model provenance and camera acceptance before releasing it; mocks do not certify security.
- Any consent, deletion, or retention change needs explicit product policy; do not invent durations.

## QR, circulation, attendance, and reservations

- Preserve physical-copy scans and legacy book QR compatibility. The current UI accepts typed or
  scanner-entered text; a webcam used for faces is not a camera QR decoder.
- Enforce copy/book association, availability, duplicate-loan and overdue checks on the server.
  A return updates the original loan; preserve `borrow_date`, `copy_id`, and historical counts.
- Maintain reservation queue/expiry/promotion behavior and attendance session timing via shared services.
  Reservations are not a guaranteed exclusive physical-copy allocation.
- Multi-book submissions make independent requests and may partially succeed. Review repeated scans,
  retries, concurrent circulation, and partial failures; do not imply an atomic batch or offline queue.

## Uploads, condition photos, and offline behavior

- Covers are public artwork. Avatars, government IDs, and imports use private storage categories.
  Reuse validated uploads, owner/category-bound tickets, and authorized private-file access.
- Store durable private object references, not expiring signed viewing URLs. Keep service credentials
  server-side and never fall back to local upload persistence in production.
- Book-condition photo capture/storage is absent. Do not repurpose public covers for condition evidence;
  agree on ownership, private access, retention, and copy/transaction linkage before adding this feature.
- Durable offline operation/synchronization is absent. Local storage and the kiosk connection indicator
  do not persist transactions for replay. Do not claim success without server confirmation.

## Analytics and reporting

- Count historical borrows using `borrow_date`, including loans now marked as returns. Preserve
  Philippine date boundaries and distinguish period activity from current inventory/overdue snapshots.
- Preserve librarian-only reports, owner-scoped transcripts, CSV formula protection, and print HTML escaping.
  Fine totals are assessed amounts, not proof of payments; recommendations are database rules, not trained ML.
- Do not claim official reporting compliance, complete exports beyond pagination limits, or measured accuracy
  without verification. Test returned-loan history, month boundaries, empty data, and access restrictions.

## Secrets, Git, deployment, and handoff

- Never expose `.env` values, credentials, tokens, signed URLs, patron records, or biometric data.
  Keep database/JWT/Supabase secret keys out of `VITE_*`, logs, fixtures, and committed files.
- Inspect configuration names/source instead of opening production records or deployment-access artifacts.
  Preserve ignored local databases, uploads, model caches, and unrelated working-tree changes.
- Do not deploy, change billing/production resources, run destructive migrations, commit, or push
  without applicable user authorization. Pushes may trigger deployment; repository config is not live state.
- Keep instructions concise; update linked architecture/setup docs when behavior changes.
  In handoffs, state what changed, why, checks actually run, failures/skips, and remaining limitations.
  Call out any schema/environment requirements and distinguish local results from production verification.
