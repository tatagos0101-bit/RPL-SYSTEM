# Rizal Provincial Library System

A library management application with a public catalogue, member portal,
librarian portal, and PIN-protected entrance station. The production website and
FastAPI backend run on Vercel; library records and uploads are stored in Supabase.

| Service | Address |
| --- | --- |
| Website | [rpl-system.vercel.app](https://rpl-system.vercel.app) |
| API health | [rpl-system-api.vercel.app/health](https://rpl-system-api.vercel.app/health) |
| Repository | [tatagos0101-bit/RPL-SYSTEM](https://github.com/tatagos0101-bit/RPL-SYSTEM) |

See [deployment instructions](docs/DEPLOYMENT.md) for Supabase setup, Vercel
projects, environment variables, migrations, and initial administrator access.
The `fixing-the-issue` repairs are local branch changes until separately released;
see the [repair ledger](docs/REPAIR_LEDGER.md) and [rollout checklist](docs/REPAIR_ROLLOUT.md).

## Features

- **Public catalogue:** search titles/authors, filter categories and availability,
  browse genre shelves, and look up books or physical copies through QR codes.
  Catalogue contents come from uploaded library inventory; there is no fixed
  number of books per category.
- **Member accounts:** email or Member ID/password login, profile and avatar
  updates, face enrollment/login, and a password-change screen for temporary
  passwords issued by staff.
- **Member dashboard:** active loans, due dates, fines, borrowing history,
  activity, and reading goals. Returned loans remain part of historical statistics.
- **Browse Books recommendations:** the first section suggests books using item
  similarity learned from favorites, book-detail views, and borrowing history.
  Members can favorite books on cards or in details. New readers see community
  popularity, with newest books filling gaps when activity is sparse.
- **Reservations:** members share five slots across active/overdue loans and
  ready/pending reservations. Selections hold no stock until atomic confirmation.
  Available capacity is protected for 24 hours; unavailable titles require explicit
  queue agreement. Existing queued readers have priority. Pickup converts a slot
  into a loan; return, cancellation and expiry free slots. Confirmation retries
  reuse a member-scoped request ID to prevent duplicates.
  Confirmation uses the authenticated session, without an additional face scan.
- **Librarian tools:** register members with a government ID upload, enroll faces,
  suspend/reactivate accounts, issue temporary password resets, manage inventory,
  import `.xlsx` workbooks with per-row validation/savepoints, and process
  borrowing/returns for individual copies. Failed cover uploads can be retried
  after a successful book save without creating another title. Book creation and
  workbook imports retain request IDs and server receipts for interrupted-response
  recovery; bulk ISBN retries skip confirmed rows. QR lists and reservations use
  server pagination. Complete QR export downloads every matching identity in bounded
  PDF batches and assembles a ZIP with a label-count manifest.
- **Entrance station:** a station PIN unlocks camera scanning and recent entry
  logs. Recognized enrolled faces create time-in/out sessions; frames can contain
  multiple people. Kiosk scans do not issue login tokens; website face login does
  not create attendance. Entry transitions serialize per member.
- **Reports:** member reading transcripts and monthly circulation PDFs, plus
  librarian CSV exports, printable reports, and QR label images/PDFs. These are
  library records; the application does not certify academic credits.

Default policies are a 14-day loan and a PHP 5 daily overdue fine, configured by
`LOAN_DAYS` and `FINE_PER_DAY`; the checkout summary reads these values from the API. The reservation pickup window is fixed at 24 hours
from ready status; refreshing never extends it. Members with overdue loans cannot
borrow additional books until those loans are returned.

## Architecture and data

| Component | Implementation |
| --- | --- |
| Frontend | React 19, Vite 7, Tailwind CSS 4, React Router, Axios |
| Backend | Python, FastAPI, SQLAlchemy, JWT authentication, bcrypt-SHA256 password hashing (legacy bcrypt verification) |
| Production database | Supabase PostgreSQL through the transaction pooler with TLS |
| Production uploads | Supabase Storage with signed uploads and private viewing links |
| Face processing | `face_recognition`/dlib and OpenCV; optional InsightFace support |
| Imports, QR codes, PDFs | openpyxl, qrcode, ReportLab, pypdf |

Authentication and member/librarian authorization are handled by FastAPI;
Supabase Auth is not used. New browser logins use HttpOnly cookies, secure in
production. PostgreSQL holds the application's 16 tables, including accounts,
password hashes, face embeddings, books/copies, loans, reservations, entry logs,
notifications, and goals. Browser Data API roles cannot directly read those tables.
The additive migration also stores private confirmation IDs, prevents normalized
email and active-reservation duplicates, and widens notification text. It aborts on
conflicting existing records without silently rewriting them.

Book covers are publicly readable. Avatars, government IDs, and temporary imports
use private Storage buckets. The backend authorizes access and generates signed
links. Database credentials, JWT secrets, and Supabase secret/service-role keys
must stay in server environment settings or ignored local environment files,
never frontend `VITE_*` variables or Git commits.

A clone contains source and schema migrations, not live accounts, library records,
or uploaded files. A fresh installation requires librarian setup and real data
registration/import. Demo seeding is restricted to local development/test databases
and requires separately configured passwords.

## Project structure

```text
RPL-SYSTEM/
├── frontend/
│   ├── src/api/              # API clients, helpers, and Node tests
│   ├── src/components/       # Shared layouts, navigation, and access guards
│   ├── src/pages/public/     # Catalogue and login pages
│   ├── src/pages/user/       # Member dashboard, catalogue, profile, reservations
│   ├── src/pages/lib/        # Librarian tools and entrance station
│   └── package.json          # Development, build, preview, and lint scripts
├── backend/
│   ├── main.py               # FastAPI application, middleware, and health check
│   ├── config.py             # Environment settings and production validation
│   ├── database.py           # SQLAlchemy engine, sessions, and schema setup
│   ├── migrate.py            # Explicit schema upgrades and data backfills
│   ├── models/               # Database models
│   ├── schemas/              # Request/response validation
│   ├── routers/              # API endpoints
│   ├── services/             # Face, Storage, loan, reservation, QR, and report logic
│   ├── middleware/           # Security headers and sanitized request logging
│   ├── tests/                # Isolated backend regression tests
│   ├── pyproject.toml        # Python dependencies and Vercel entry point
│   └── uv.lock               # Resolved runtime dependencies
├── supabase/migrations/      # Initial PostgreSQL schema and Storage buckets
├── scripts/                  # Schema generation and Vercel proxy configuration
├── docs/DEPLOYMENT.md        # Cloud deployment and operating instructions
└── vercel.json               # Frontend build, API proxy, and SPA rewrites
```

## Local development

Use Python 3.12, [uv](https://docs.astral.sh/uv/), and Node.js 22.12 or newer with
npm. The backend supports Python 3.11–3.12; the Vercel runtime is pinned to 3.12.
The project metadata selects a compiled `dlib-bin` dependency for face recognition.

From a fresh checkout, install dependencies and copy the backend environment template:

```powershell
uv sync --project backend --python 3.12
npm --prefix frontend ci
Copy-Item -LiteralPath backend/.env.example -Destination backend/.env
```

Edit `backend/.env` before starting. For an isolated local database, set
`DATABASE_URL=sqlite:///./rizal_library.db`, `ENVIRONMENT=development`,
`STORAGE_BACKEND=local`, and `AUTO_MIGRATE=true`. Replace the JWT secret and
librarian authorization code with unique random values. Set or change the entrance
station PIN in **Librarian → Settings**, confirming your librarian password and a
new 6–12 digit PIN. Existing stations need the new PIN on their next scan/log refresh.
Local MySQL is also supported if its database and connection URL are configured.
Keep this environment file private. Do not overwrite an existing configured file.

Start the backend in one terminal:

```powershell
Set-Location backend
uv run python run.py
```

Start the frontend from the repository root in another terminal:

```powershell
npm --prefix frontend run dev
```

The default frontend is `http://localhost:5173` and the backend is
`http://localhost:8000`. Interactive API docs are available at
`http://localhost:8000/docs` in development. If you change the API address, set
`VITE_API_URL` in an ignored `frontend/.env` and restart Vite.

For a fresh local installation, use the development API docs to call
`POST /api/auth/signup` with `role=librarian`, a strong password, and the private
`LIBRARIAN_AUTH_CODE` configured in your environment. Then sign in through
`/librarian/login`, register members, and add/import inventory. Do not use shared
default credentials. Production bootstrap instructions are in the deployment guide.

## Deployment

The Vercel `rpl-system` project builds the frontend from repository root `.`;
`rpl-system-api` runs FastAPI from `backend`. Both projects are connected to this
repository's `main` branch. The website proxies `/api/*`, `/health`, and `/uploads/*`
to the API, and serves React Router pages through an `index.html` fallback.

Leave `VITE_API_URL` unset for this production proxy setup. Apply initial Supabase
SQL migrations for a new project, then run explicit additive migrations before
releasing schema changes. Production uses `AUTO_MIGRATE=false` and does not store
records or uploads on Vercel's local filesystem. Follow the
[deployment guide](docs/DEPLOYMENT.md) for the full configuration.

## Checks and known limitations

Run checks from the repository root:

```powershell
uv run --project backend --with pytest python -m pytest backend/tests -q -p no:cacheprovider
node --test frontend/src/api/*.test.js
npm --prefix frontend run build
```

Default backend tests use isolated SQLite and test settings; they need no production
credentials. The repair suite also has an opt-in disposable localhost PostgreSQL
check via `REPAIR_TEST_DATABASE_URL`, restricted to an empty `rpl_repair_test`
database. It verifies migrations, runtime grants, savepoints and concurrent writes.
See the [repair ledger](docs/REPAIR_LEDGER.md) for current local results and skipped
checks. These results do not verify production deployment or real-camera accuracy.

- **Photo spoofing remains possible:** static photographs passed the current
  brightness/texture heuristic and obtained a face-login session during QA.
  Detection and matching work, but face-only login needs stronger liveness
  verification or another authentication factor. Actual camera accuracy with
  enrolled library members remains unverified.
- **Email/SMS delivery is not integrated:** public password-recovery requests
  direct users to a librarian. Staff can issue temporary password resets;
  notifications currently appear in the application.
- **Recommendation quality is not yet measured on real readers:** item-based
  collaborative filtering runs on demand, supplemented by author/category matches
  and popularity. It has no separately trained model or external AI service.
  Synthetic ranking tests verify behavior, not real-world accuracy. Feedback is
  stored privately in the database; deploy the additive migration before this API.
- **InsightFace is optional:** the included deployed runtime uses dlib. Selecting
  InsightFace requires its separate dependencies and model setup.
- **Design documents can describe planned work:** files under `docs/superpowers/`
  are specifications/plans, not proof that a feature is implemented.
