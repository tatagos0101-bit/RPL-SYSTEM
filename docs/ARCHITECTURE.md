# Rizal Provincial Library architecture

Baseline inspection: **October 14, 2026**. Station PIN management documentation
updated **October 15, 2026** and checked against the main-branch release. Repository
configuration alone does not verify live production state. MiniFASNet PAD work
found during inspection remains separate and uncommitted; it is excluded from
this release. Recheck source and Git status before relying on release status.

Use [AGENTS.md](../AGENTS.md) for working instructions, [README](../README.md) for
setup, and [DEPLOYMENT.md](DEPLOYMENT.md) for hosting configuration. Requirements
and files under `docs/superpowers/` express intent; they are not implementation evidence.

## Components and data flow

```text
React browser application
  -> Axios /api requests with account cookie (legacy bearer supported)
  -> FastAPI routes -> authorization dependencies -> services / SQLAlchemy
  -> Supabase PostgreSQL

Authorized upload request -> FastAPI -> signed Supabase Storage upload URL
Browser -> Storage upload -> FastAPI verifies owner-bound ticket and content
Authorized private-asset request -> FastAPI -> expiring Storage viewing URL

Entrance station -> PIN-protected kiosk API -> face checks -> attendance records
```

| Area | Source and responsibility |
| --- | --- |
| Frontend | [package manifest](../frontend/package.json): React 19, Vite 7, Tailwind 4, React Router 7, Axios, react-webcam, Lucide, and spreadsheet utilities. JavaScript/JSX, not TypeScript. |
| Routes and UI | [App.jsx](../frontend/src/App.jsx) lazy-loads public, member, and librarian pages. The active entrance station is `pages/lib/EntryGate.jsx`; the older `pages/EntryGate.jsx` is not its routed implementation. |
| API integration | [client.js](../frontend/src/api/client.js), [urls.js](../frontend/src/api/urls.js), and [uploads.js](../frontend/src/api/uploads.js) centralize requests, URL resolution, and direct uploads. |
| Backend | [main.py](../backend/main.py) registers routes, middleware, startup validation, and health checks. [pyproject.toml](../backend/pyproject.toml) specifies Python 3.11–3.12, FastAPI, SQLAlchemy, and runtime dependencies; `.python-version` selects 3.12. |
| Organization | [routers](../backend/routers), [schemas](../backend/schemas), [models](../backend/models), and [services](../backend/services) separate HTTP handling, validation, persistence, and shared behavior. |
| Supporting libraries | OpenCV, Pillow, NumPy, face-recognition/dlib; optional InsightFace/ONNX Runtime; openpyxl for workbook parsing, qrcode for labels, and ReportLab for PDFs. |

Frontend code uses functional components, hooks, shared layouts, Tailwind classes,
and API helpers. Backend code uses dependency injection, Pydantic models, SQLAlchemy
sessions, and shared policy services. Match local conventions rather than applying
a new formatter or imposing an unconfigured backend lint tool.

## Supabase architecture and deployment boundaries

The agreed target matches the implemented split: **FastAPI owns identity and
authorization; Supabase provides PostgreSQL and Storage.** There is no Supabase
Auth integration, browser database SDK, or user-specific Supabase JWT/RLS flow.
SQL migrations enable RLS and revoke application-table access from `anon` and
`authenticated`; backend database credentials are privileged, so API authorization
remains essential. Browser Storage uploads use server-issued signed capabilities.

[Configuration validation](../backend/config.py) requires PostgreSQL and Supabase
Storage in production. [Database settings](../backend/services/database_config.py)
normalize PostgreSQL URLs, require cloud TLS, use `NullPool`, and disable psycopg
prepared statements for transaction pooling. SQLite and MySQL paths remain for
local development; they are not evidence of the production persistence target.

[Root Vercel configuration](../vercel.json) builds `frontend/dist` and proxies
`/api`, `/uploads`, and `/health` to the separate API project. The SPA fallback
supports React Router URLs. [Backend Vercel configuration](../backend/vercel.json)
selects FastAPI, Singapore, and a 60-second function limit. Production defaults to
same-origin browser requests with `VITE_API_URL` unset. Development uses localhost
unless an API URL is configured; Vite also proxies `/uploads`.

[Dockerfile](../backend/Dockerfile) and [Railway configuration](../backend/railway.toml)
remain alternate deployment artifacts; the latter invokes migrations before deployment.
Some comments still mention earlier hosting choices. Files in the repository do
not establish which revision, environment variables, policies, or models are live.
Production persistence must not depend on the host filesystem.

Environment names and defaults live in [config.py](../backend/config.py) and the
[backend](../backend/.env.example) / [frontend](../frontend/.env.example) examples.
Key groups are database/storage, JWT/cookies/CORS, station PIN, circulation policy,
face engine/thresholds, and migration mode. Do not infer that environment templates
exhaust every supported setting. Keep values private; never place server secrets
in browser-visible `VITE_*` variables. The backend loader reads `backend/.env`;
an arbitrary `.env.local` file is not automatically loaded by that code.
Frontend Vite builds reject known server-only environment settings before emitting
assets; the frontend Supabase connection was removed and the guard released on
October 19. See [cleanup evidence](FRONTEND_CREDENTIAL_CLEANUP.md). The API retains
its independent database/Storage configuration and owns authorization.

## Persistence and migrations

The [models](../backend/models) and [initial SQL](../supabase/migrations/20261010000100_library_schema.sql)
describe 14 application tables after the session and recommendation upgrades:

| Tables | Relationship and meaning |
| --- | --- |
| `users`, `face_embeddings` | Accounts hold role/status, password hashes, private-asset references, and legacy dlib encodings. Engine-specific embedding rows belong to users and record engine, dimension, source, and active state. |
| `auth_sessions` | Expiring server-side login sessions, linked to users and bound to their current password hash via an HMAC digest. No raw JWTs are stored. |
| `book_interactions` | Private member/book favorite and recent-view state, preserved by the security integration. |
| `books`, `book_copies` | A title has physical copies. Copy QR codes are unique; `(book_id, copy_number)` is unique. Status includes available, borrowed, damaged, lost, and retired. Titles also keep aggregate counts and legacy QR codes. |
| `transactions` | One loan links user, book, and optionally a physical copy for legacy compatibility. Returning changes that same row rather than adding a separate circulation event. |
| `reservations`, `notifications` | Reservations link members to titles with queue/status/expiry information. Notifications may target a user; null user IDs denote librarian notifications. |
| `entry_logs`, `reading_goals` | Attendance sessions and annual user goals. Entry logs permit a null user for unidentified visitors and distinguish granted/denied access. |
| `password_reset_codes`, `security_alerts`, `library_settings` | Hashed expiring reset codes, security events that may include face snapshots, and key/value settings. A table's presence does not prove a complete UI or operational workflow. |

[database.py](../backend/database.py) creates metadata and invokes additive upgrades;
PostgreSQL initialization takes an advisory transaction lock. [migrate.py](../backend/migrate.py)
also backfills member IDs, physical copies/legacy loans, and legacy face embeddings.
[schema_migrations.py](../backend/services/schema_migrations.py) adds enumerated
missing columns and applies PostgreSQL table-access restrictions. It is not an
Alembic migration history or a general index/constraint reconciliation mechanism.

The two initial Supabase SQL files provision a new project; do not replay the
table-creation script against an existing database. The [schema generator](../scripts/generate_supabase_schema.py)
compiles without connecting but overwrites the initial SQL file. Future upgrades
must preserve existing data and be tested for repeatability on an isolated target.
Production defaults to `AUTO_MIGRATE=false`; development startup can run migrations.
The additive `20261016000100_auth_sessions.sql` creates session storage without
rewriting existing records. Apply it before deploying session-aware code, or use
the existing explicit Python migration path on an authorized target. The initial
schema SQL has not been regenerated. Runtime-role preparation under
`supabase/operations/` is a separate, explicitly authorized operation.
Even some read routes call backfill/status-sync helpers that commit changes, so an
HTTP GET is not necessarily free of database writes.

## Identity and authorization

[Authentication routes](../backend/routers/auth.py) use bcrypt and PyJWT-signed JWTs.
Session and upload-ticket verification requires expiry and subject claims and an
explicit HMAC algorithm. Existing correctly signed HMAC tokens retain their wire
format; session-row and password-hash checks still apply. Asymmetric and unsigned
algorithm configurations are rejected at startup.
Email or Member ID can identify a password login. New browser sessions use an
HttpOnly cookie, with Secure enabled in production; token-bearing JSON responses
and bearer authorization remain supported. The frontend removes the old stored
token after a new login, retains UI metadata, and sends cookies through Axios.

[dependencies.py](../backend/dependencies.py) verifies the token, its server-side
session, expiry, and password-hash binding, reloads the account, rejects suspended
users and non-session tokens, and implements role checks. Logout revokes the
presented cookie/bearer sessions. Password changes and resets revoke all old
sessions; a password change issues a replacement browser cookie. Tokens issued
before the session upgrade require a new login. Bearer transport remains supported
for newly issued session tokens. Failed or unavailable session lookups never
grant access.
Only `member` and `librarian` are persisted roles. Public catalog access is anonymous.
Resource ownership is enforced by individual routes; not every user route uses the
strict `require_member` dependency. Librarian signup requires a private authorization
code; the librarian registration flow issues temporary member passwords.

[RequireRole.jsx](../frontend/src/components/RequireRole.jsx) verifies the profile
and redirects accounts requiring a password change. Backend dependencies also
enforce this flag: authenticated profile retrieval, password change, and logout
remain available; other protected operations are denied until completion.
Newly registered contact details remain unverified until ownership is established;
existing verification flags are not rewritten. Public recovery requests return generic
librarian-help responses outside tests; email/SMS delivery is not integrated.

[Kiosk routes](../backend/routers/kiosk.py) require a separate station PIN and invoke
face processing with token issuance disabled. The browser keeps that PIN in session
storage. A station unlock is not librarian authentication. Preserve request limits,
safe validation errors, and [security middleware](../backend/middleware/security.py)
that avoids reflecting credentials and raw input into errors/logs.
Rate limits can share Redis storage across instances. Until a shared endpoint is
configured, the default remains process-local memory. Redis failures reject
limited requests when configured; live multi-instance and trusted-client-address
verification are required before cutover. See the
[security rollout procedure](SECURITY_ROLLOUT.md).

The librarian sidebar places Settings alone below its navigation divider. Settings
contains the browser's light/dark appearance toggle, station PIN controls, and logout.
Theme and logout controls are no longer duplicated in the librarian header/sidebar.

Librarians manage the station PIN at `/librarian/settings`, using their current
account password and a new 6–12 digit PIN. The [settings API](../backend/routers/librarian_settings.py)
provides a protected GET/PUT at `/api/librarian/settings/entry-station-pin`; GET
returns configuration status only, and PUT verifies the librarian password and is
rate-limited. The [PIN service](../backend/services/entry_station_pin.py) stores a
salted HMAC-SHA256 digest in the existing `library_settings` table, keyed by the
server JWT secret. It reads the setting on every station request, so old PINs stop
working on subsequent checks after a change. Requests already authorized can finish.
Until a managed PIN exists, the environment value remains a bootstrap fallback;
missing/default production values leave the kiosk disabled without blocking API
startup. JWT secret rotation requires staff to set the PIN again. No schema change
or production migration is needed on an initialized database.

## Facial recognition and attendance

[face_engine_service.py](../backend/services/face_engine_service.py) supports dlib
Euclidean-distance matching and optional InsightFace cosine-distance matching.
Automatic mode tries InsightFace before dlib; explicit InsightFace requires separate
dependencies/models. The documented production runtime selects dlib. Enrollment
checks for duplicates, preserves legacy encodings, and can add engine-specific
embeddings during fallback upgrades. Login rejects multiple faces; kiosk processing
can recognize several faces and avoids recording the same identity twice per frame.

The released [liveness service](../backend/services/liveness_service.py) uses
brightness, face size, and texture heuristics. Static photographs can pass these
checks; they do not establish liveness or prevent replay. Separate uncommitted
MiniFASNet work inspected on October 14 adds two ONNX models through OpenCV DNN
and fail-closed presentation checks. That work and its model assets/tests are
excluded from this release; physical-camera acceptance remains pending. Passive
RGB classification would not prove camera origin or prevent every injection attack.

Legacy encodings and embeddings are JSON text, not anonymized or application-encrypted
biometrics. Spoof branches may store raw images in `security_alerts.snapshot_b64`.
No explicit biometric consent, retention/purge workflow, or complete security-alert
management UI was found. Do not infer these from design documents or invent policy.

[Attendance policy](../backend/services/entry_session_policy.py) defaults to first
scan = time-in, repeats before five minutes = still inside, later scan = time-out,
and scans within two minutes of time-out = update the same session. A later scan
starts another visit. These intervals are configurable. Unrecognized/suspended
matches are denied without exposing the suspended identity. Face login also uses
the attendance-processing path; it is not only an authentication operation.

## Catalog, QR codes, circulation, and reservations

[Inventory routes](../backend/routers/inventory.py) implement title editing, workbook
import, cover uploads, and printable QR labels. [Copy services](../backend/services/book_copy_service.py)
maintain physical-copy identities and legacy-loan backfills. Resizing uses row locks
and retires copies rather than reusing their identifiers. Copy statuses existing in
the schema do not imply a complete damage/loss-management workflow.

Copy codes have the form `RPL-BOOK-00007-C002`; legacy title QR codes remain accepted.
[Catalog scan routes](../backend/routers/books.py) normalize and resolve codes.
[Borrow/return UI](../frontend/src/pages/lib/LibBorrowReturn.jsx) accepts keyboard or
scanner-entered text, identifies members by face lookup or supervised manual ID,
and submits copy-aware requests. No camera QR decoder was found.

[Transaction routes](../backend/routers/transactions.py) require librarian access.
Borrowing rejects suspended members, overdue loans, unavailable/mismatched copies,
and another active/overdue loan for the same member/title. It creates a loan,
updates availability, and fulfills an applicable reservation. Returning closes
that row, preserves its borrow date, calculates a fine, restores availability,
and attempts promotion of the next queued reservation. Default loan/fine settings
come from configuration; fine storage does not record payment collection.

[Reservations](../backend/routers/reservations.py) accept available titles as ready
for pickup and unavailable titles as pending. [Policy helpers](../backend/services/reservation_policy.py)
expire ready reservations, renumber queues, and promote eligible pending entries.
Expiry/status synchronization is request-driven; no background scheduler was found.
Reservations are title-level, do not reduce stock, and are not exclusive copy holds:
initial ready creation checks availability without subtracting other ready reservations.

Borrow/return handlers lock the member and then the book, and keep copy preparation,
overdue/expiry updates, loan changes, and inventory changes in one transaction.
Duplicate checks run after the locks; competing returns re-read the active loan.
Disposable PostgreSQL tests cover the same copy, the same member/title, independent
copies, and duplicate returns. The UI still sends one request per cart item, with no
idempotency keys, atomic batch, or durable replay after an unknown outcome.

## Uploads, condition photos, and offline limits

[Storage service](../backend/services/storage_service.py), [upload tickets](../backend/services/cloud_uploads.py),
[upload routes](../backend/routers/uploads.py), and [bucket SQL](../supabase/migrations/20261010000200_storage_buckets.sql)
establish these categories:

| Category | Access and purpose |
| --- | --- |
| Covers | Public catalog artwork; librarian-authorized uploads, up to 5 MB. |
| Avatars | Private profile images, up to 5 MB. |
| IDs | Private government ID images/PDFs, up to 10 MB; librarian document access. |
| Imports | Private temporary workbook uploads, up to 10 MB; librarian-only import. |

Direct uploads use signed URLs plus expiring JWT tickets bound to uploader and
category. API consumers validate ticket ownership and file content/size before use.
Private database references identify objects (`supabase://...`), not expiring
viewing URLs; authorized endpoints resolve fresh links. Local mode exposes covers
statically and gates private ID/avatar paths. Production rejects local persistence.

There is no book-condition photo capture, schema association, upload category, or
access workflow. Loan issue reports contain a reason/note and notify librarians;
they are not photographic evidence. Future condition photos require agreed private
access, ownership, retention, and transaction/copy linkage rather than reuse of
public cover storage.

No service worker, IndexedDB transaction queue, or synchronization/reconciliation
implementation was found. Browser storage retains UI/auth metadata and catalog
selections; the entrance-station Offline label reflects connectivity. Neither
provides offline attendance, borrowing, returns, or reservations.

## Analytics and reporting

[Report routes](../backend/routers/reports.py) and [PDF service](../backend/services/report_service.py)
produce owner-scoped reading transcripts and librarian monthly reports. Dashboard
and user endpoints provide trends, reading goals, activity, and genre breakdowns.
[Recommendation service](../backend/services/recommendation.py) computes item-based
cosine similarities from member/book signals in SQL. A borrow contributes 5,
a current favorite 3, and a detail view 1, each once per member/book. Historical
loans include returned books. Only active members contribute community signals;
the requesting member is excluded from the peer vectors used for similarities.
Collaborative matches precede author/category matches, then popularity, then new
books; availability takes priority over these tiers. Previously borrowed books
and pending/ready reservations are excluded. Popularity uses current favorites
and views/borrows within 30 days; that window is a ranking rule, not data retention.

`book_interactions` stores one private row per member/book with favorite state and
latest view time, not a raw click stream. Member-only `/api/user/favorites` (GET),
`/api/user/favorites/{book_id}` (PUT/DELETE), and `/api/user/book-views/{book_id}`
(POST) derive ownership from authentication. Atomic upserts change only the
submitted fields. Direct browser database access remains revoked. Recommendations
retain the list API and add per-book `source` (`collaborative`, `content`, `popular`,
or `new`) and an explanation without other members' identities or histories.

Browse Books loads recommendations independently above search/catalog. Favorite
changes synchronize cards and details; recommendation refreshes wait until an
open detail modal closes. There is no separate training job, dense in-memory
interaction matrix, external AI service, or measured real-reader accuracy.

The member header and Browse Books presentation reuse the civic theme from
`ui-update`: Segoe UI, semantic light/dark colors, the RPL seal, and regular-case
headings and controls. The visual reference was the production release
[`dpl_hYYWEWKfAwp4eQbFZugvMA4DkK3i`](https://rpl-system-7h9tt475a-tatagos0101-5211.vercel.app),
checked on October 16, 2026 with synthetic member/book responses. This records the
design reference, not deployment of the recommendation feature.

Borrow counts use `borrow_date`, including rows now typed as returns. Monthly
reports mix period circulation/visits with current overdue and inventory snapshots;
fine sums are not a payment ledger. Visit filters differ by endpoint, and aggregate
unavailable stock is not necessarily all on loan. Preserve or explicitly revise
these definitions rather than silently relabeling metrics.

[Frontend report helpers](../frontend/src/api/reports.js) filter/paginate records,
escape CSV formula prefixes and print HTML, and build exports. The report UI offers
CSV, printable records, and monthly PDFs; it does not establish national reporting
compliance. Paginated retrieval has a maximum-page cap, so export completeness must
be checked for the intended dataset. Use [backend](../backend/timezone_utils.py)
and [frontend](../frontend/src/api/dateTime.js) time helpers when changing dates;
some display formatting still follows the browser timezone.

## Verification map

Exact commands are in [AGENTS.md](../AGENTS.md). Frontend Node tests cover shared
helpers, while ESLint and Vite build are separate checks. No frontend test script
or backend lint configuration is present. Backend [fixtures](../backend/tests/conftest.py)
use isolated in-memory SQLite and temporary upload directories; rate limiting is
disabled in that fixture. [Cloud tests](../backend/tests/test_cloud_integration.py)
compile PostgreSQL SQL and mock Storage rather than exercise live Supabase policies.

| Change area | Relevant existing regression coverage / additional acceptance |
| --- | --- |
| Identity/access | Registration/uploads, information security, password recovery, first-login password, entry-station PIN, and frontend auth-route tests. Check wrong-role, suspended, anonymous, and cross-owner requests. |
| Circulation/inventory | Copy QR, book edit, overdue, reservation policy, and frontend scan tests. Check exact-copy returns, duplicate scans, history preservation, expiry and queue promotion; assess concurrency separately on isolated PostgreSQL. |
| Attendance/biometrics | Entry-session policy, face-engine upgrade, and entry-station tests. Check denied token/access issuance, enrollment preservation, multiple faces, and timing boundaries. Future PAD changes also need corrupt/missing-model and spoof rejection coverage. |
| Storage | Cloud integration, upload validation, and information-security tests. Check ticket owner/category/expiry, private ID/avatar access, invalid content, and no production local fallback. |
| Reports | Reading history, monthly PDF, frontend reports, and date-helper tests. Check returned loans, Philippine month boundaries, empty results, escaping, pagination, and access. |

Use browser verification for changed interactions and consented physical-camera
acceptance for biometric changes. Mocked detections and small reference sets are
not accuracy/security certification; pending PAD tests are not part of this release.
Keep real patron data out of all fixtures and test artifacts. Report the actual
checks, limitations, and skipped work instead of copying historical pass counts.
