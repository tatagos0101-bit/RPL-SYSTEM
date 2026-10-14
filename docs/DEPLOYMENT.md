# Vercel and Supabase deployment

The website runs in the Vercel `rpl-system` project. The FastAPI application runs
in a separate Vercel `rpl-system-api` project with `backend` as its root directory.
Supabase stores all library records and face embeddings in PostgreSQL, plus book
covers, member avatars, ID documents, and import files in Storage.

Authentication remains in FastAPI. Supabase Auth is not used by this application.
Database passwords and Supabase secret/service-role keys belong only in server
environment variables. Never put them in a `VITE_*` variable or commit `.env` files.

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
