# Rizal Provincial Library architecture

Repair branch implementation checked **October 18, 2026** and released from
merged main **October 21, 2026**; see the [repair ledger](REPAIR_LEDGER.md) and
[live release evidence](REPAIR_RELEASE_2026-10-21.md) for checks and limits.
Baseline inspection: **October 14, 2026**. Station PIN management documentation
updated **October 15, 2026** and checked against the main-branch release. Repository
configuration alone does not verify live production state. The November 7, 2026
working tree adds contact OTP delivery, MiniFASNet PAD integration and fixed browse
categories. These changes are not evidence of deployment; see their linked rollout
and acceptance notes below. Recheck source and Git status before relying on release status.

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

The November 13 local public presentation revision uses
[discovery.css](../frontend/src/styles/discovery.css) for the landing page, catalog
and their navigation/drawer. The latest user-selected public palette is walnut
brown, warm paper and amber. Newsreader display type and DM Sans controls/body are
self-hosted with their font licenses. The shared global roles in
[index.css](../frontend/src/index.css) and protected-page styling were not changed
by that public-page revision. [Photography credits](../frontend/public/images/CREDITS.md)
identify the locally served library photographs; they are generic imagery, not
photographs of the RPL branch.

The November22 landing motion update extends that existing presentation with a
full-width photographic background, slow CSS photo/light/dust movement, and a
landing-only translucent header. Background motion plays automatically and respects
reduced-motion preferences. `useLandingMotion` reveals content once as it
enters view and pauses the background off-screen or on hidden pages using scoped
IntersectionObservers; it adds no scroll-driven React renders. Without the observer
API, content stays visible. Search, catalog, login routes and photography credits
are retained; no video, animation package or new external media is loaded.
The wide-screen refinement removes the landing page's 1360px content cap in favor
of shared 3vw gutters (28–80px), including its header, journey, services and footer.
The hero fills the viewport with centered, fluid display type and a wider search
form. Mobile layouts retain comfortable side gutters.
The public catalog now shares those fluid desktop gutters with its header; its
existing book sizes, vertical desktop grid, mobile swipe shelves and 24-title
pagination remain. Desktop pagination sits beside the shelf heading. The public
Home/Catalog header uses visible Home, About Us, Catalog and Contact links instead
of a drawer. About Us and Contact route to the homepage's short introduction and contact
information using hash anchors, smooth scrolling and reduced-motion handling.

The public librarian welcome page and staff sidebar link to `/librarian/catalog`.
It reuses the public book list with librarian navigation: Home and the brand return
to `/librarian`. Signed-in librarians see Staff Hub links back to
`/librarian/home` in the header and welcome-page primary action; public catalog
navigation does not sign them out.
Otherwise Sign In opens `/librarian/login`. The explicit URL preserves
the portal after search, pagination, reloads and bookmarked visits. Its read-only
details omit member reservation prompts; it grants no staff permissions. `/browse`
keeps the reader-facing navigation, and management routes still require a librarian
session on the server.

[PublicBrowse](../frontend/src/pages/public/PublicBrowse.jsx) shares small category
cover collages, [BookShelf](../frontend/src/components/public/BookShelf.jsx) and
[CatalogBookCard](../frontend/src/components/public/CatalogBookCard.jsx) styling
with the member catalog. Category cards stay in one horizontal row on every screen,
with side arrows when the row overflows and native swipe scrolling. On desktop
(at least 800px, hover/fine pointer), full book results form a vertical wrapping
grid. Mobile and coarse-pointer devices retain swipe scrolling for book results
even in wide landscape. Member Featured collections keep horizontal
scrolling at every screen size, as explicitly requested in the latest clarification.
Shelf arrows only scroll the loaded view; server pagination remains separate.
Landing Search routes to `/browse?q=...`, and the public search uses URL-backed
query state plus literal title/author highlights. Existing detail-modal behavior
and role destinations remain. Public genre cover previews now come from the
independent `include_previews=true` category metadata, with at most three public
cover references per visible genre. All books mixes these samples; changing the
result genre/search/page cannot replace navigation artwork. Plain category calls
retain their original category/count response. No external catalog or circulation
writes were added.

The November16 catalog discovery revision extends the public book list with validated
`sort=title|trending|newest|loved` (default title) and `favorites_only` (default false).
Grouped read-only queries apply deterministic global ordering before pagination.
Trending counts recent30-day `borrow_date`, including returned loans; newest uses
library creation dates. Most loved counts distinct active, nondeleted member
favorites. Positive-only filtering keeps unloved books out of Books we love. Public
responses retain the existing book-only shape, without member identities. LIKE
wildcards are escaped so search input is literal.
See [discovery design](superpowers/specs/2026-11-16-catalog-discovery-design.md)
and [local verification](superpowers/specs/2026-11-16-catalog-discovery-verification.md).

The shared [login page](../frontend/src/pages/public/LoginPage.jsx) retains its
original split layout, bookshelf backdrop and authentication/camera behavior.
Scoped [auth.css](../frontend/src/styles/auth.css) supplies the walnut/amber tone,
updated type and rounded controls. CSS motion is limited and reduced-motion views
remain static. See the [approved design](superpowers/specs/2026-11-13-public-experience-revision-design.md)
and [revision verification](superpowers/specs/2026-11-13-public-experience-revision-verification.md).

The subsequent November 13 librarian presentation update uses scoped
[librarian.css](../frontend/src/styles/librarian.css) for walnut/amber dark mode
and a warm-paper light variant. The existing Settings appearance toggle remains
functional. Its single import in the root CSS entry follows Tailwind so cascade
layers retain their established order; global role values are unchanged.
[LibLayout](../frontend/src/components/LibLayout.jsx) supplies grouped drawer
navigation and a compact notification header. The November 16 workflow revision
keeps the drawer closed and inert initially at every viewport, including desktop;
the menu, close, overlay and navigation-link controls still operate it. Notification
bounds follow measured header size, with subscriptions cleaned up on unmount.

Both portal bell menus link to protected notification detail pages and paginated
inboxes at `/user/notifications` and `/librarian/notifications`. Opening a detail
uses the existing confirmed read mutation, refreshes header read indicators, and
offers known reservation/circulation links. The APIs enforce member ownership or
librarian-only shared notifications; no notification schema upgrade is required.

[LibDashboard](../frontend/src/pages/lib/LibDashboard.jsx) displays nine
metric drill-downs and collection, circulation, activity and attention content.
The Acquisitions section and its summary tile are no longer shown on the dashboard.
[LibReports](../frontend/src/pages/lib/LibReports.jsx)
now displays chart payloads already returned with the matching records; it adds
no requests, calculations or report categories. Its filter/export/pagination
handlers and signed snapshot context remain unchanged. The staff-only
[ReportChart](../frontend/src/components/reporting/ReportChart.jsx) variant draws
grouped circulation with straight solid/dashed lines and different point shapes;
default grouped bars, scales, keyboard values and data tables remain available.
That presentation pass left the backend, manifests, API helpers and public/login
sources unchanged.
See the [workspace design](superpowers/specs/2026-11-13-librarian-workspace-design.md)
and [local verification](superpowers/specs/2026-11-13-librarian-workspace-verification.md).

The November 16 workflow revision applies scoped [member-theme.css](../frontend/src/styles/member-theme.css)
colors and local typography to existing member pages without changing their
layouts or event handlers. Inventory uses a wider, horizontally scrollable table
on narrow screens; headers, counts, status and actions remain readable on one line.
Its View details action opens a read-only cover/metadata/description preview using
the existing inventory response and shared modal controls.
See the [workflow verification](superpowers/specs/2026-11-13-workflow-revision-verification.md)
for the local tests and migration limits.
Member Browse Books also provides shared top/bottom pagination and returns to the
catalog heading on page changes, respecting reduced motion. The book viewer has
fixed viewport-bounded dimensions, contained covers and internally scrolling
details; its bottom slider is removed and phone navigation remains visible. See the scoped
[catalog alignment verification](superpowers/specs/2026-11-16-member-catalog-alignment-verification.md).
The public catalog viewer now uses the same fixed frame, contained/fallback cover
and scrolling details, with the lower slider removed. Its search, pagination and
role-specific reservation links are unchanged.

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

The October 21 member-management release added explicit face/account deletion
and camera capture feedback. Account deletion retains deidentified historical
foreign keys and requires the additive `users.deleted_at` column; it is not a
hard cascade delete. See [policy, storage failure behavior and release
requirements](MEMBER_MANAGEMENT.md) and the [release record](REPAIR_RELEASE_2026-10-21.md).

[Inactive account review](ACCOUNT_INACTIVITY.md) adds automatic notices after six
calendar months of recorded inactivity and a 72-hour response window. The notice
job never deletes accounts: a librarian reviews and password-confirms a mature,
unanswered notice. Renewed activity/member replies prevent approval. The explicit
manual deletion path remains available with the existing outstanding-loan/private
storage/history safeguards. New private `account_deletion_notices` and nullable
`users.last_activity_at` require an additive upgrade and runtime RLS/grants before
the compatible backend. In-app notices are durable; email-first/optional phone SMS
delivery reports provider outcomes honestly. Future sign-ins/station encounters
persist activity; missing old session history is not reconstructed or claimed.
The separate purpose-authenticated job is scheduled only after release checks;
repository code alone is not evidence that a hosted schedule is enabled.

The October 19 [runtime-role audit](RUNTIME_ROLE_REHEARSAL.md) found an owner-capable
API connection. On October 25, production switched to `rpl_api_runtime`, inheriting
only the restricted `rpl_app_runtime` group. All 16 application tables have the
required CRUD/sequence permissions and runtime RLS policies; browser-role access
remains revoked. Actual encrypted pooler, full-API synthetic workflow and Storage
checks passed before promotion of unchanged main application source. The runtime
login stays enabled; `AUTO_MIGRATE=false` is preserved. Diagnostic deployments were
removed and public API/website-rewrite smoke checks passed.
Production `DATABASE_URL` selects this restricted connection. The subsequent
[owner-credential cleanup](OWNER_CREDENTIAL_RETIREMENT.md) removed all `POSTGRES_*`
variables from API Production and released a clean runtime environment. Storage
credentials remain required. The operator confirmed the old owner-password reset;
post-reset API/Storage checks passed. Vercel recreated owner variables during that
reset; they were removed again. Check future integration syncs for reinjection before
deployment. Historical credential exports are no longer the maintenance setup.

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
describe 17 application tables after the session, recommendation, repair and reporting upgrades
(the applied initial SQL is intentionally unchanged):

| Tables | Relationship and meaning |
| --- | --- |
| `users`, `face_embeddings` | Accounts hold role/status, password hashes, private-asset references, and legacy dlib encodings. Engine-specific embedding rows belong to users and record engine, dimension, source, and active state. |
| `auth_sessions` | Expiring server-side login sessions, linked to users and bound to their current password hash via an HMAC digest. No raw JWTs are stored. |
| `book_interactions` | Private member/book favorite and recent-view state, preserved by the security integration. |
| `books`, `book_copies` | A title has physical copies. Copy QR codes are unique; `(book_id, copy_number)` is unique. Status includes available, borrowed, damaged, lost, and retired. Titles also keep aggregate counts and legacy QR codes. |
| `copy_acquisitions` | Optional one-to-one metadata for existing physical copies: source, verified acquisition date, donor/supplier, cost/currency/reference and recording staff. No legacy acquisition backfill. |
| `transactions` | One loan links user, book, and optionally a physical copy for legacy compatibility. Returning changes that same row rather than adding a separate circulation event. |
| `reservations`, `notifications` | Reservations link members to titles with queue/status/expiry information. Notifications may target a user; null user IDs denote librarian notifications. |
| `reservation_confirmations` | Member/request ID primary key, canonical payload fingerprint and resulting reservation IDs for atomic confirmation retries. Private backend-only access. |
| `inventory_writes` | Librarian/request ID primary key, operation, payload fingerprint and committed book/import result. The receipt commits with inventory; only its owner can reconcile it. Browser roles have no table access. |
| `entry_logs`, `reading_goals` | Attendance sessions and annual user goals. Entry logs permit a null user for unidentified visitors and distinguish granted/denied access. The November 20 local upgrade adds nullable manual visitor name/location and a unique request ID for retry-safe manual attendance; see [entrance station](ENTRANCE_STATION.md). |
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

Logout clears account metadata and account-scoped selections only after server
revocation succeeds; failed logout exposes retry. Anonymous selections are separate.

[Authentication routes](../backend/routers/auth.py) use bcrypt-SHA256 for newly set
passwords, retain legacy bcrypt verification, and use PyJWT-signed JWTs. New passwords
require 8–128 characters including a digit. Login accepts legacy passwords up to
1024 UTF-8 bytes; a successfully verified legacy bcrypt password over 72 bytes
requires replacement without adopting its unverified suffix. Email lookup ignores
case and rejects ambiguous identities. Suspension revokes sessions; reactivation
requires fresh login.
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
Member profile names are displayed as locked text while editing and are
server-protected: changed or null names
are rejected before any other profile field changes; an unchanged legacy name
remains accepted. Members can still edit phone/location and use the existing
password-confirmed email flow. Librarian own-profile name editing is unchanged.

Librarian registration accepts an optional government ID; attached files/tickets
retain the existing private-upload validation. It creates a random 10-character
password with forced first-login change, commits the member, then attempts email
first or SMS when only a phone is present. The registration-only
[delivery service](../backend/services/registration_delivery.py) uses existing SMTP
settings and separately enabled Twilio credentials. Accepted sends omit the plaintext
password from the registration response. Missing contacts or unavailable/unconfirmed
delivery return a librarian-handoff status and the same temporary password. Both
existing registration modals show that outcome. No plaintext password is stored;
no registration resend queue or new schema is added. Staff password resets retain
their original 14-character default and revocation behavior. See
[registration delivery setup](CONTACT_VERIFICATION.md#new-member-registration-credentials).

[RequireRole.jsx](../frontend/src/components/RequireRole.jsx) verifies the profile
and redirects accounts requiring a password change. Backend dependencies also
enforce this flag: authenticated profile retrieval, password change, and logout
remain available; other protected operations are denied until completion.
Newly registered contact details remain unverified until ownership is established;
existing verification flags are not rewritten. Public recovery requests return generic
responses outside tests. [Contact verification](CONTACT_VERIFICATION.md) adds
email-only Resend SMTP delivery, single-use purpose/contact-bound codes, and
verified-email recovery. Registration-only SMS does not grant phone
verification/recovery authority; phone numbers remain editable contact data. Email edits require password confirmation and
clear verification/invalidate codes. Provider configuration, delivery acceptance and rollout
remain separate requirements. `/api/auth/session` performs a fresh session/role
check for navigation without avatar signing or biometric reads; full profiles
remain available separately. Forced password changes are still enforced.

[Kiosk routes](../backend/routers/kiosk.py) require a separate station PIN and invoke
face processing with token issuance disabled. The browser keeps that PIN in session
storage. A station unlock is not librarian authentication. Preserve request limits,
safe validation errors, and [security middleware](../backend/middleware/security.py)
that avoids reflecting credentials and raw input into errors/logs.
The repair branch spaces station scans by 1.5 seconds and coalesces log reads with
a 2.5-second minimum interval, leaving headroom for two stations sharing the current
120-scan/60-log-read per-minute public-IP limits. Automatic requests honor
`Retry-After`, with a 60-second fallback for 429 and five seconds for other failures.
Restart preserves pending requests and cooldowns. See [staging evidence](REDIS_STAGING.md)
for synthetic verification and the remaining production requirements.
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

The [liveness service](../backend/services/liveness_service.py) checks frame quality
and two bundled MiniFASNet ONNX models through OpenCV DNN. Recognition screens
every exact detected face before identity/access side effects. Failed, uncertain
or unavailable checks fail closed, including both enrollment paths. Checksummed
models load lazily; no runtime model downloads are needed. See
[provenance and physical acceptance](../backend/assets/anti_spoof/README.md).
Live-face/phone trials are user-reported passes; printed-photo testing was waived by the operator on November 7, 2026 (not performed). This integration is not a production deployment or PAD certification.
Passive RGB classification does not prove camera origin or prevent all replay.

The November 22 performance pass adds request-scoped work in
[face_frame.py](../backend/services/face_frame.py). The frame is decoded once into
the same RGB/BGR pixels. PAD predictions are reused only for identical model input
tensors within that request; the precheck and every recognition-box check remain,
with unchanged models, thresholds and uncertainty handling. Different frames and
different tensors never share a prediction. Galleries are read once per engine
within a scan, while current templates/accounts are still revalidated before access.
All images, predictions and gallery references are cleared when the request ends.
Numeric `Server-Timing` headers expose decode/precheck/detection/PAD/match/verification
and total processing time without images, identities or credentials. Stage durations
are inclusive and can overlap; they do not measure camera capture or network time.

Login and circulation use nonoverlapping scans with a 1.5-second minimum interval
between request starts, counting processing time instead of adding another full
wait after a slow response. Error/rate-limit backoff remains. Login navigates on a
verified response, showing a check and the recognized name for 500ms before routing
(previously 900ms). This feedback stops the camera immediately and is cancelled on
page/method changes or hiding. Login ignores cancelled late results and stops camera
tracks on hiding; resuming needs an explicit retry.
Concurrent member profile/fine reads are coalesced only while in flight and within
the same auth scope. Completed responses are never cached. Login/logout clear the
read scope; profile updates invalidate pending sharing for that resource. Public
catalog pages contain 24 titles, with the existing top/bottom navigation. Search
remains debounced; initial/page requests start immediately and obsolete reads abort.

[The synthetic benchmark](../scripts/benchmark_face_work.py) measures repeated
decoding and identical PAD inputs only (`python scripts/benchmark_face_work.py`).
It does not use a camera or database and does not measure face detection, identity
matching, network latency or real-person accuracy. `--backend PATH` can compare
source checkouts with the same Python environment. Synthetic browser coverage in
`frontend/tests/performance_browser.cjs` checks request counts, pagination, scan
cleanup, role rejection and mandatory password changes at desktop/mobile sizes.

Legacy encodings and embeddings use JSON in server memory and are not anonymous.
[Biometric storage](BIOMETRIC_STORAGE.md) adds authenticated AES-256-GCM encryption
at the ORM boundary for both template formats and `security_alerts.snapshot_b64`.
The existing TEXT columns remain compatible with staged backfill; production
requires server keys and transition/strict mode. This is implementation capability,
not confirmation that existing live rows have been migrated. Spoof branches may
retain facial snapshots; encryption does not make them anonymous.
No explicit biometric consent, retention/purge workflow, or complete security-alert
management UI was found. Do not infer these from design documents or invent policy.

The public `/privacy-policy` information page is linked beside the landing copyright
and at the entrance station. The station shows its notice before an explicit camera
start and pauses when hidden. Neither the link nor an operator starting the camera
records patron consent; shared scanning still processes unidentified faces.

[Attendance policy](../backend/services/entry_session_policy.py): current kiosk clients
send IDs still present in the camera. Continuous sightings do not toggle attendance;
two successful frames without that member re-arm the next appearance. The first
appearance records entry, the next records exit, and another starts a new visit.
The UI shows Inside/elapsed time while open and full Philippine timestamps after exit.
Presence tracking is browser-local, not durable idempotency: reloads, lost responses,
and multiple stations require care and physical-camera acceptance. PostgreSQL member
row locking serializes writes but does not deduplicate separate encounter requests.
Legacy station clients omitting presence information retain configurable
five-minute minimum visits and two-minute exit-update windows. Unrecognized/suspended
matches are denied without exposing the suspended identity. Website face login only
authenticates; station scans record attendance. New timestamps are timezone-aware
Philippine time; legacy naive values are interpreted as Philippine time.

## Catalog, QR codes, circulation, and reservations

[Inventory routes](../backend/routers/inventory.py) implement title editing, workbook
import, cover uploads, and printable QR labels. [Copy services](../backend/services/book_copy_service.py)
maintain physical-copy identities and legacy-loan backfills. Resizing uses row locks
and retires copies rather than reusing their identifiers. Copy statuses existing in
the schema do not imply a complete damage/loss-management workflow.

Books have an optional nullable plain-text `description`. Create/update requests
accept at most 2000 characters; blank values clear it and omitted update values
preserve it. Public/member book details display it as text. Add Book offers an
editable manual description and an explicit online-summary choice when ISBN
metadata contains one; workbook `Description` is optional. Acquisition entry
fields were removed from the Add Book UI, while existing acquisition records,
imports and inventory actions remain. Existing installations need the additive
`books.description` upgrade before this backend starts; the applied initial SQL
was not regenerated.

Copy codes have the form `RPL-BOOK-00007-C002`; legacy title QR codes remain accepted.
[Catalog scan routes](../backend/routers/books.py) normalize and resolve codes.
[Borrow/return UI](../frontend/src/pages/lib/LibBorrowReturn.jsx) uses a shared
[circulation dialog](../frontend/src/components/CirculationDialog.jsx), launched
with separate Borrow books and Return books buttons. Borrowing identifies a member
through existing face lookup or supervised manual ID, then automatically lists
ready/pending reservations. Ready titles offer one-click Add to list, automatically
choosing a validated available physical copy from the existing read-only lookup.
Its number/code is shown in the pending/review list; Change copy is optional when
multiple copies are available. Queued/unavailable titles cannot be picked up. QR camera, USB
Enter-terminated input and manual code entry remain optional for reserved pickups
and are the default for walk-ins without active reservations. Failed reservation
loads show retry and optional scanning, without claiming there are no reservations.
Returns also start with automatic member facial identification, with supervised
email/Member ID lookup as an alternative. The existing librarian-only active-loans
endpoint supplies that member's active/overdue books. Each Add to return list
selection retains the exact loan, copy and member IDs; no book scan is required.
This lookup computes overdue display status without persisting status changes,
materializing physical copies, or assigning legacy loans to copies.
Transaction-log and Due Books shortcuts use this same identification/selection
flow. QR/code entry is explicitly opened as a fallback, never automatically for
empty or failed loan lists. Within an identified-member session, fallback scans
are restricted to that member's loans. Staff unable to identify a member can
explicitly open the code-only fallback, checking each loan's borrower at review;
only that fallback may include different borrowers. Scanning and selection create
no circulation transaction; direct legacy QR scans still require explicit ambiguous
copy/loan selection. Automatic reservation selection never silently swaps a stale
copy at confirmation; staff hand over the physical copy shown in review.
Both selection paths share the original review, per-item submission and recovery
flow. Review precedes all submissions. See [QR circulation](QR_CIRCULATION.md)
for the locally implemented October 31, 2026 changes, recovery and acceptance limits.

[Transaction routes](../backend/routers/transactions.py) require librarian access.
Borrowing rejects suspended members, overdue loans, unavailable/mismatched copies,
and another active/overdue loan for the same member/title. It creates a loan,
updates availability, and fulfills an applicable reservation. Returning closes
that row, preserves its borrow date, calculates a fine, restores availability,
and attempts promotion of the next queued reservation. Default loan/fine settings
come from configuration; fine storage does not record payment collection.

[Reservations](../backend/routers/reservations.py) use a five-book combined quota:
active/overdue loans plus pending/ready reservations. Selections consume no slots or
stock. Atomic batch confirmation requires explicit agreement to queue unavailable
titles and stores member-scoped request IDs, payload fingerprints and reservation
IDs in `reservation_confirmations`. A reused ID with different contents returns 409.
The legacy single-title endpoint uses the same rules. Structured conflicts identify
quota, duplicate reservations and changed availability.

[Policy helpers](../backend/services/reservation_policy.py) expire ready holds and
fill available capacity in stable FIFO order, ahead of new confirmations. Ready
holds protect title-level capacity for 24 hours, including against walk-in loans and
stock reductions; no specific physical copy is allocated. Pending reservations hold
no stock and receive their deadline only on promotion. Expiry is request-driven,
including every stock-changing operation. Pickup converts a reservation into a loan
without using another slot. Existing over-limit members may return/cancel but cannot
add commitments. Historical loan/reservation records prevent title deletion.

Borrow/return handlers lock the member and then the book, and keep copy preparation,
overdue/expiry updates, loan changes, and inventory changes in one transaction.
Duplicate checks run after the locks; competing returns re-read the active loan.
Disposable PostgreSQL tests cover the same copy, the same member/title, independent
copies, and duplicate returns. Borrow/return carts still send independent requests;
successful items remain visible and unattempted items are identified. Keyed writes
lock the librarian before member/book locks and save a payload fingerprint and
response receipt in the existing `inventory_writes` table with the loan commit.
Returns submit an exact transaction ID, preventing delayed requests from closing
newer loans. Unknown outcomes stop the batch and require receipt checking or an
explicit retry with the original key. Only account-scoped recovery IDs persist in
the browser; there is no automatic replay. Reservation batches are atomic and persist a
confirmation ID locally before submission, allowing safe retries after reload.
These are separate workflows; neither is an offline transaction queue.

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
Members can add/change or remove their own photo. `DELETE /api/user/avatar`
rechecks the locked account/session, validates the private avatar reference and
rejects references shared with another account. Storage deletion precedes clearing
the reference; failure is retryable and never reports success. If the later database
commit fails, a retained reference may already point to a deleted object; retry
finishes clearing it. No account or ID deletion is performed. Confirmed photo
changes update the profile/navigation in the current tab and refresh other tabs
through the existing authenticated profile revision mechanism.
See [profile/public verification](superpowers/specs/2026-11-16-profile-public-revision-verification.md)
for local evidence and cloud/concurrency limits.
Repeated avatar finalization never deletes the current reference. Cover replacement
cleanup runs after commit only when no title still references the old cover. Book
save/cover failure is reported as partial success with a cover-only retry. Full
inventory import supports `.xlsx`, validates each row against `BookCreate`, uses
savepoints, and reports committed counts and original workbook row numbers. Browser
ISBN extraction still accepts `.xls`; server inventory import rejects it clearly.
The browser saves an account-scoped request ID before sending book creation or
workbook import, and reconciles `/api/inventory/write-requests/{id}` before retrying.
`inventory_writes` stores the outcome in the same transaction; concurrent retries
serialize on the librarian row. A reused ID with different contents returns 409.
Workbook hashes bind retries to the original bytes, and committed outcomes replay
before consuming another upload ticket. Legacy clients without request IDs retain
legacy behavior. ISBN rows retain confirmed outcomes and frozen retry payloads.
Do not clear browser recovery data while an outcome is unknown; another browser
or a newly generated request ID does not identify the original operation.

Copy-label and librarian-reservation lists have matching search/count endpoints
and stable server pagination. Empty copy selection is rejected. Explicit complete
QR export captures matching copy IDs, fetches PDFs in batches of 200, and creates a
browser ZIP only after all batches succeed, with a label-count manifest. Missing
identities or failed batches abort the download. The snapshot fixes membership,
not mutable title metadata. Large ZIPs require browser memory; standard ZIP size
limits fail visibly. Each server request stays bounded instead of rendering the
entire collection inside one serverless invocation. Member-list loan counts and
face-enrollment flags use page-scoped aggregate queries rather than one query per
member. `/api/books/policy` supplies checkout loan days, fine and server-calculated
Philippine-time due-date preview; the actual transaction response is authoritative.

There is no book-condition photo capture, schema association, upload category, or
access workflow. Loan issue reports contain a reason/note and notify librarians;
they are not photographic evidence. Future condition photos require agreed private
access, ownership, retention, and transaction/copy linkage rather than reuse of
public cover storage.

No service worker, IndexedDB transaction queue, or durable offline synchronization
exists. Browser storage retains UI/auth metadata, catalog selections and inventory
request recovery state; online receipt lookup is required for reconciliation; the entrance-station Offline label reflects connectivity. Neither
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

Member Browse Books defaults to Featured. Owner-scoped reading stats determine
whether to show the existing ten recommendations above Trending; no-history members
start with Trending. What's new and Books we love follow for both. Each resource
has independent loading, empty and retry feedback. Favorite changes synchronize
cards/details and refresh the community favorites shelf; recommendation refreshes
wait until an open detail modal closes. Genre/All books views use the server sort
and top/bottom pagination. See all/category/search changes reset to the first page.
The member browse reserved-count control opens the existing My Reservations page;
its selection-plus-reservation count is unchanged.
There is no new rating/editorial system, separate training job, dense in-memory
interaction matrix, external AI service, or measured real-reader accuracy.

The October16 member header/Browse Books presentation used the civic theme from
`ui-update`: Segoe UI, semantic light/dark colors, the RPL seal, and regular-case
headings and controls. The November16 local presentation now uses the existing
walnut/amber palette and local Newsreader/DM Sans. The earlier visual reference was the production release
[`dpl_hYYWEWKfAwp4eQbFZugvMA4DkK3i`](https://rpl-system-7h9tt475a-tatagos0101-5211.vercel.app),
checked on October 16, 2026 with synthetic member/book responses. This records the
design reference, not deployment of the recommendation feature.

Borrow counts use `borrow_date`, including rows now typed as returns. Monthly
reports mix period circulation/visits with current overdue and inventory snapshots;
fine sums are not a payment ledger. Denied entries are excluded from member visit
statistics, activity and goals. Borrowed stock counts active/overdue loans rather
than total stock minus available stock. Report date bounds are validated first.

The [reporting center](REPORTING_CENTER.md) replaces dashboard polling and browser-wide
report retrieval with librarian-only `/api/reporting` aggregates, contextual filters,
stable server pagination, native SVG charts, acquisition metadata and PDF/XLSX/CSV/print
exports. Shared safe projections and signed dataset fingerprints reject stale previews;
PostgreSQL reads use a read-only REPEATABLE READ snapshot. The old report helpers and
monthly URL and patron transcript contract remain. The monthly PDF now includes
monochrome categorized summaries and full details using the same read-only projections;
it separates period activity from current snapshots and rejects oversized downloads.
The separate NLP preparation category is removed. Add Book, ISBN/workbook imports, additional-copy
entry and admin inventory use the same per-copy acquisition records as Reports;
source counts/filters are librarian-only and public catalog contracts are unchanged.
Acquisition metadata requires the separate
additive reporting migration before deployment; production has not been migrated by
this work. Programs/activities and detailed staff qualifications are explicitly excluded.

Member, catalog, inventory and transaction screens retain their existing server
search/pagination and independent totals. Overdue reminders
explicitly report delivery unavailable until a provider exists. Shared native dialogs
provide focus containment/Escape/restoration, and an application error boundary offers
recovery for rendering failures. Use [backend](../backend/timezone_utils.py)
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
| Attendance/biometrics | Entry-session policy, face-engine upgrade, and entry-station tests. Check denied token/access issuance, enrollment preservation, multiple faces, and timing boundaries. PAD tests include corrupt/missing-model and spoof rejection coverage. |
| Storage | Cloud integration, upload validation, and information-security tests. Check ticket owner/category/expiry, private ID/avatar access, invalid content, and no production local fallback. |
| Reports | Reading history, monthly PDF, frontend reports, and date-helper tests. Check returned loans, Philippine month boundaries, empty results, escaping, pagination, and access. |

Use browser verification for changed interactions and consented physical-camera
acceptance for biometric changes. Mocked detections and small reference sets are
not accuracy/security certification; physical printed-photo acceptance is pending.
Keep real patron data out of all fixtures and test artifacts. Report the actual
checks, limitations, and skipped work instead of copying historical pass counts.


## Category mapping

See [category normalization and migration](CATEGORY_MAPPING.md) for the authoritative
fixed Open Library browse vocabulary, hidden-label review, and additive book metadata columns.
Book covers load lazily with asynchronous decoding. A bounded 256-entry in-process
cache reuses deterministic QR PNGs; authorization stays in the existing endpoints.
These remove repeated work, but live cold-start/network latency needs rollout measurements.
