# Vercel and Supabase deployment

The October 21 repair release migrated `users.deleted_at` and deployed the
member-management endpoints, camera UI and portal synchronization to both projects.
See [release evidence and recovery limits](REPAIR_RELEASE_2026-10-21.md) and
[member-management policy](MEMBER_MANAGEMENT.md).

The website runs in the Vercel `rpl-system` project. The FastAPI application runs
in a separate Vercel `rpl-system-api` project with `backend` as its root directory.
Supabase stores all library records and face embeddings in PostgreSQL, plus book
covers, member avatars, ID documents, and import files in Storage.

Authentication remains in FastAPI. Supabase Auth is not used by this application.
Database passwords and Supabase secret/service-role keys belong only in server
environment variables. Never put them in a `VITE_*` variable or commit `.env` files.

## Environment security and change boundaries

For the session migration, Redis preparation, restricted database role, and the
approval sequence for cloud changes, see [security rollout](SECURITY_ROLLOUT.md).
The [Redis staging checklist](REDIS_STAGING.md) records the managed API Preview
service and Vercel checks; shared Redis is not yet enabled in production.
The [runtime-role audit/rehearsal](RUNTIME_ROLE_REHEARSAL.md) includes the tested
14-table baseline permission candidate and its pending cloud switch/recovery plan.
It also records the confirmed live owner/admin-capable database login and the
strengthened isolated checks.
October 20's protected Preview also passed the actual candidate's encrypted pooler
login and all 14-table permission checks. It was removed and the candidate disabled
again. Cloud API/Storage workflow acceptance is still required before cutover.
Production still uses the existing owner connection. The live repair schema now
contains 16 application tables; restricted-role grants and application acceptance
must cover all 16 before a separate runtime-role cutover.
The October 17 integration uses PyJWT with the existing HMAC token format and
requires an explicit HS256, HS384, or HS512 configuration (HS256 remains the default).
Apply `20261016000100_auth_sessions.sql` before the API release; preserve the
recommendation schema. Runtime-role preparation now includes `book_interactions`.
No signing-secret rotation or new circulation schema is required by this integration.
The remaining setuptools compatibility advisory and separate pending PAD work are
documented in the rollout guide; source preparation does not establish live safety.

The frontend is React/Vite, not Next.js. Its only application configuration input
is `VITE_API_URL`; it calls FastAPI rather than querying Supabase tables directly.
Vite exposes `VITE_*` values to client imports. `NEXT_PUBLIC_*` is not an automatic
public prefix here, but must still never contain privileged credentials.
The Vite config loads only the `VITE_` prefix for development proxy configuration.

| Names | Current purpose and handling |
| --- | --- |
| `DATABASE_URL`, `POSTGRES_URL` | Backend connection. A nonempty `DATABASE_URL` wins; `POSTGRES_URL` is the integration fallback. Shared database configuration is also used by migrations. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Backend Storage connection. The key may be a legacy service-role JWT or a new secret key; keep it server-side under the name the application reads. |
| `SUPABASE_SECRET_KEY` | Not read as a fallback by the current application. Do not rename/substitute credentials without verifying the affected consumer. |
| `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_DATABASE` | Not individually read by current application tools. Integration or external maintenance consumers may still need them; verify before removing. Prisma is not configured in this repository. |
| `SUPABASE_JWT_SECRET` | Not the application's signing secret. Rotation can affect legacy Supabase keys and external consumers. |
| `JWT_SECRET_KEY` | Application signing secret. The launcher and ASGI startup share known-default and minimum-length checks; those checks do not measure entropy. Generate a random value. |
| `LIBRARIAN_AUTH_CODE`, `ENTRY_STATION_PIN` | Server-only registration and kiosk configuration; preserve the managed PIN precedence described below. |
| `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_*` aliases | Not used by this SPA. Public keys cannot replace the privileged key used for backend Storage operations. |

Keep real environment files out of Git and build artifacts. Existing `.gitignore`,
`.vercelignore`, and `backend/.dockerignore` exclusions cover local environment
files and private runtime artifacts; `.env.example` files contain placeholders.
Never log configuration objects, database URLs, request credentials, or secret values.
Use isolated development credentials and keep production `AUTO_MIGRATE=false`.

### Vercel integration warnings and rotation

The October 16, 2026 audit found integration credentials on both Vercel projects
and `readable-secret` warnings. This is a configuration finding, not evidence that
a value was bundled or publicly exposed. Treat this as a dated observation and
recheck current settings before acting.

The intended arrangement is a frontend without database/privileged Storage
credentials and an API project with the required secrets. Integration-created
variables cannot simply be converted to Secret from Vercel's variables list.
Vercel documents disconnecting the resource from its projects, rotating its
secrets, reconnecting with Sensitive enabled (excluding Development for that
integration connection), and redeploying. Coordinate that process with explicit
approval, all credential consumers, verification, and a recovery plan; revoking
old credentials can prevent an old deployment from working as a rollback.
Do not duplicate variables merely to dismiss warnings.

Database credentials, Supabase Storage keys, `SUPABASE_JWT_SECRET`, and the
application's `JWT_SECRET_KEY` have different consumers. Application signing-key
rotation invalidates sessions and signed application tickets, and requires
resetting the managed station PIN. It is not required just because an unrelated
integration variable has a warning. Never weaken RLS or replace a privileged
Storage credential with an anon/publishable key to bypass errors.

Dashboard edits, credential rotation, database-role/policy changes, migrations,
and deployment require separate authorization. Source edits do not perform these
actions. The subsequent authentication changes and migration prerequisites are
described in [security rollout](SECURITY_ROLLOUT.md); dependency and biometric
remediation remain separate work.

### Frontend artifact and header verification

The [frontend credential cleanup](FRONTEND_CREDENTIAL_CLEANUP.md) records the
consumer inventory and scoped release procedure. Vite builds now reject known
server configuration in the frontend environment before generating assets. Keep
database, Supabase, authentication and Redis settings on the API project; the
frontend requires only public API configuration. This also applies to custom
build modes and `VITE_*` dotenv settings. Existing artifact scanning remains active.

`npm --prefix frontend run build` now builds with Vite and runs
`frontend/scripts/check-build-secrets.mjs`. The check fails on recognizable secret
keys, service-role JWTs, credentialed database URLs, private keys, and exact known
secret values available in the build process environment (including common URL
and JSON encodings). It reads no `.env` files, makes no network calls, and prints
only counts/categories on failure. Missing or unreadable build output fails closed.

This is a regression guard, not proof that arbitrary secrets are absent. Exact
matching skips values shorter than eight characters to avoid incidental matches;
unavailable secrets and arbitrary transformations cannot be reliably detected.
Do not pull production secrets into a local environment to run this check. Use
synthetic fixtures for its tests:

```powershell
node --test frontend/scripts/*.test.mjs
node frontend/scripts/check-build-secrets.mjs
uv run --project backend --with pytest python -m pytest backend/tests/test_deployment_config.py -q -p no:cacheprovider
```

Both frontend Vercel configurations apply frame protection, `nosniff`, and a
referrer policy to frontend routes, excluding API/upload/health proxy routes.
The minimal CSP restricts framing, base URLs, and embedded objects; it is not a
complete script-injection policy. It does not restrict camera permissions,
scripts, images, or API connections. The proxy configuration script preserves
these headers. After a separately authorized deployment, verify the actual HTTP
headers on `/` and a nested frontend route, then check login, camera capture,
private images, and API proxy behavior. Local builds do not verify edge headers.

References: [Vite environment variables](https://vite.dev/guide/env-and-mode),
[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[Vercel Config/Secret variables and integrations](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## 1. Supabase schema and Storage

Use the linked `supabase-rizal-library` resource or create a Supabase project near
your users (Singapore). For an empty project, apply the two SQL files in
`supabase/migrations/` in order through the SQL Editor or Supabase CLI.
The first creates the 12 application tables and enables RLS. The second creates
the Storage buckets. These initial migrations must be applied only once.

The `anon` and `authenticated` Data API roles have no direct application-table
access. The backend connects using the project's PostgreSQL credentials and
performs the application's member/librarian authorization.

| Bucket | Access | Contents |
| --- | --- | --- |
| `rpl-covers` | Public read; server-authorized writes | Catalogue artwork |
| `rpl-avatars` | Private | Member profile photos |
| `rpl-ids` | Private | Government ID images/PDFs |
| `rpl-imports` | Private | Temporary Excel imports |

Private object references are stored in the database. Fresh signed viewing links
are generated when an authorized request needs a private asset. Large uploads go
directly from the browser to Storage with signed upload URLs; the API verifies
the upload ticket's owner, category, expiry, and uploaded content before using it.
This preserves 5 MB image and 10 MB ID/Excel upload limits on Vercel.

## 2. FastAPI Vercel project

Import `tatagos0101-bit/RPL-SYSTEM`, select root directory `backend` and the FastAPI
preset. `backend/pyproject.toml` pins Python and the runtime dependencies. Its uv
dependency metadata uses the compiled `dlib-bin` wheel already used by the Docker
setup, avoiding a dlib compiler build. The API runs in `sin1` with a 60-second
maximum request duration. Keep local uploads, logs, databases and secrets excluded
using `backend/.vercelignore`.

Connect the Supabase marketplace resource to this project for **Production**.
The application accepts the integration's `POSTGRES_URL`, or an explicit
`DATABASE_URL` using the Supabase transaction pooler (port 6543):

```text
postgresql+psycopg://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@POOLER_HOST:6543/postgres?sslmode=require
```

Copy the actual host from Supabase's Connect panel; do not guess it. The application
uses TLS, no SQLAlchemy session pool, and no prepared statements for this pooler.

Set these additional server environment variables:

| Variable | Production value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `AUTO_MIGRATE` | `false` |
| `STORAGE_BACKEND` | `supabase` |
| `SUPABASE_URL` | Provided by the marketplace integration |
| `SUPABASE_SERVICE_ROLE_KEY` | Provided by the integration; server only |
| `JWT_SECRET_KEY` | Random secret with at least 32 characters |
| `LIBRARIAN_AUTH_CODE` | Random private librarian registration code |
| `ENTRY_STATION_PIN` | Optional legacy/bootstrap PIN; managed PINs are set in Librarian Settings |
| `ALLOWED_ORIGINS` | Exact HTTPS frontend origins, comma-separated |
| `AUTH_COOKIE_SAMESITE` | `lax` |
| `HTTPS_ONLY` | `true` |
| `LOG_TO_FILES` | `false` |
| `FACE_ENGINE` | `dlib` (the included runtime) |

Production rejects local database/storage configurations and default account secrets.
An absent station PIN (or the development default) leaves kiosk access disabled;
it does not prevent the API from starting so a librarian can configure it.
Apply future additive schema changes explicitly with `python migrate.py` using
the cloud database settings before releasing them. Startup does not perform DDL
on every serverless cold start. `/health` checks database connectivity.

### Inventory retry and list repair upgrade

The `fixing-the-issue` repair release requires the additive `inventory_writes`
table before its frontend ships. Run the existing migration path, retain receipts
across upgrades, and update restricted runtime grants using
`supabase/operations/prepare_runtime_role.sql` (16 application tables). Receipts
are private to the backend and scoped to the originating librarian. Keep
`AUTO_MIGRATE=false`, preserve RLS/browser-role revocations, and deploy the backend
before the frontend. The complete QR export uses bounded PDF requests so it does
not require a longer Vercel function duration. It assembles the ZIP in browser
memory and reports interruption instead of offering a partial archive.

Follow the staged [repair rollout](REPAIR_ROLLOUT.md), including an isolated
production-shaped migration rehearsal and approval for the live maintenance
window. Local synthetic tests are not evidence of a production migration.

### Personalized recommendation upgrade

Before deploying the recommendation API, run the existing `python migrate.py`
upgrade from `backend/` against the explicitly selected database. This creates
`book_interactions` and adds history/reservation indexes to existing tables;
repeated execution preserves rows. The upgrade enables RLS and revokes `anon` and
`authenticated` table access, including on the new table. Do not regenerate or
reapply the initial schema SQL. Keep production `AUTO_MIGRATE=false`.

Deploy the backend before the frontend. No new credentials, ML dependencies,
external inference service, or scheduled training job are needed. Existing loans
provide initial signals; favorites and latest detail views accumulate afterward.
Missing feedback endpoints produce a recoverable favorites error while the
catalog remains usable. Rolling back application code can
leave the additive table/indexes in place; do not drop member feedback.

The opt-in `backend/tests/test_recommendations_postgres.py` check requires an empty,
disposable localhost database named `rpl_recommendation_test`, selected with
`RECOMMENDATION_TEST_DATABASE_URL`. It applies migrations, checks RLS/privileges,
races favorite/view updates, and benchmarks synthetic activity. Never point this
test at Supabase or an existing library database. Normal backend tests skip it
unless explicitly configured. Local timings do not establish cloud performance.

## 3. Frontend Vercel project

Use repository root `.` with the Vite preset. Root `vercel.json` installs using
`npm --prefix frontend ci`, builds the frontend, and serves `frontend/dist`.
React Router pages have an index.html fallback.

Once the API has a production domain, configure the same-origin proxy:

```powershell
python scripts/configure_vercel.py https://YOUR_API_DOMAIN
```

Commit the generated `vercel.json` changes. Leave `VITE_API_URL` unset in the
frontend's Production environment. `/api/*` and `/health` are proxied to the API;
the browser keeps its HttpOnly login cookie on the website origin. This avoids
depending on third-party cross-site cookies between different hosting domains.
Private asset signed URLs are used directly and are not prefixed with the API URL.

Add any custom frontend domain to the API's `ALLOWED_ORIGINS`, then redeploy.

## 4. First librarian and library data

This deployment has an initial librarian with Member ID `RPL-ADMIN`. Its temporary
password, entrance station PIN, and librarian signup code are in the ignored local
file `.tools/deployment-access.txt`. Sign in at `/librarian/login` and choose a new
password when prompted. Keep that file private; it is not uploaded or committed.
For a separate fresh installation, create a librarian through `/api/auth/signup`
using the private registration code and a strong password.

### Entrance station PIN management

Sign in as a librarian, open **Settings**, and enter your current librarian password
plus a new 6–12 digit PIN twice. The old station PIN is not required. Use the new
PIN on each entrance station; an already unlocked station returns to its lock
screen when its next scan or attendance-log request rejects the old PIN.

The existing `library_settings` table stores a salted HMAC-SHA256 digest keyed by
the server JWT secret; neither the PIN nor its digest is returned by the settings API.
No schema migration is required for this feature on an initialized database.
The database setting overrides `ENTRY_STATION_PIN` on every request, across API
instances. The environment PIN remains a bootstrap fallback only until a managed
setting exists. Production never grants station access using the development default.
Rotating `JWT_SECRET_KEY` also invalidates the managed station PIN: sign in again
and set the station PIN through Settings. Do not delete the setting to recover access.

Import actual library books through Inventory. Do not run `seed.py` against
production: it creates demo data. The script now refuses production or remote
databases and requires unique `SEED_LIBRARIAN_PASSWORD` and
`SEED_MEMBER_PASSWORD` values for local use. It never prints credentials.

A Git clone contains application source, not the original library database or
runtime uploads. Existing local records/files are not automatically moved by
deployment. Preserve an export/backup and migrate those separately if they exist.

## 5. Verification

For the `fixing-the-issue` branch, use the [repair rollout checklist](REPAIR_ROLLOUT.md):
validated additive migration and runtime access, then backend, then frontend.
The October 21 release completed that rollout; see its
[verification record](REPAIR_RELEASE_2026-10-21.md). Future releases still require
their own recovery point and applicable checks.

Check the API `/health`, open a nested frontend route directly, log in, reload,
and confirm the session remains active. Add a book/upload its cover, register a
member with an ID, and update that member's avatar. Confirm records in Supabase's
Table Editor and objects in Storage; confirm avatars and IDs are private.
An unauthenticated ID request must return 401 and a member request must return 403.

The backend regression suite runs with:

```powershell
python -m pytest backend/tests -q
node --test frontend/src/api/*.test.js
npm run build --prefix frontend
```

The existing password-recovery code has no email/SMS delivery provider. Librarian
password resets work; self-service email/SMS recovery needs a delivery integration
before it can send real codes. Until then, all public recovery requests give the
same librarian-help response; reset codes are exposed only in the automated test
environment. Biometric accuracy still requires on-device camera
testing with enrolled members; deployment does not establish biometric accuracy.

Feature QA on October 11, 2026 confirmed that the current brightness/texture
heuristic accepts static face photographs, including through the deployed login
and simulated webcam flow. Face detection/matching works, but photo/replay
resistance is not established. Face-only login needs stronger liveness or an
additional authentication factor before it can be considered secure.

Sources: [Supabase SQLAlchemy connections](https://supabase.com/docs/guides/troubleshooting/using-sqlalchemy-with-supabase-FUqebT),
[Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi),
[uv dependency metadata](https://docs.astral.sh/uv/concepts/resolution/).
