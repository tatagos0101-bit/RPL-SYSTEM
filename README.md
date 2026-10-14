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

## Features

- **Public catalogue:** search titles/authors, filter categories and availability,
  browse genre shelves, and look up books or physical copies through QR codes.
  Catalogue contents come from uploaded library inventory; there is no fixed
  number of books per category.
- **Member accounts:** email or Member ID/password login, profile and avatar
  updates, face enrollment/login, and a password-change screen for temporary
  passwords issued by staff.
- **Member dashboard:** active loans, due dates, fines, borrowing history,
  activity, reading goals, and recommendations based on borrowing categories and
  trending titles. Returned loans remain part of historical statistics.
- **Reservations:** signed-in members select and reserve books, view queue or
  pickup status, and cancel reservations. Available books become ready for pickup;
  unavailable books join a queue. Returns can promote waiting reservations.
  Confirmation uses the authenticated session, without an additional face scan.
- **Librarian tools:** register members with a government ID upload, enroll faces,
  suspend/reactivate accounts, issue temporary password resets, manage inventory,
  import Excel workbooks, and process borrowing/returns for individual copies.
- **Entrance station:** a station PIN unlocks camera scanning and recent entry
  logs. Recognized enrolled faces create time-in/out sessions; frames can contain
  multiple people. Kiosk scans do not issue login tokens.
- **Reports:** member reading transcripts and monthly circulation PDFs, plus
  librarian CSV exports, printable reports, and QR label images/PDFs. These are
  library records; the application does not certify academic credits.

Default policies are a 14-day loan, a PHP 5 daily overdue fine, and a 24-hour
reservation pickup window. `LOAN_DAYS`, `FINE_PER_DAY`, and
`PICKUP_WINDOW_HOURS` configure these values. Members with overdue loans cannot
borrow additional books until those loans are returned.

## Architecture and data

| Component | Implementation |
| --- | --- |
| Frontend | React 19, Vite 7, Tailwind CSS 4, React Router, Axios |
| Backend | Python, FastAPI, SQLAlchemy, JWT authentication, bcrypt password hashing |
| Production database | Supabase PostgreSQL through the transaction pooler with TLS |
| Production uploads | Supabase Storage with signed uploads and private viewing links |
| Face processing | `face_recognition`/dlib and OpenCV; optional InsightFace support |
| Imports, QR codes, PDFs | openpyxl, qrcode, ReportLab, pypdf |

Authentication and member/librarian authorization are handled by FastAPI;
Supabase Auth is not used. New browser logins use HttpOnly cookies, secure in
production. PostgreSQL holds the application's 12 tables, including accounts,
password hashes, face embeddings, books/copies, loans, reservations, entry logs,
notifications, and goals. Browser Data API roles cannot directly read those tables.

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

Backend tests use an isolated SQLite database and test settings; they do not need
production credentials. QA on October 11, 2026 passed 68 backend tests and 50
frontend tests, plus live cloud workflows and desktop/mobile browser checks.

- **Photo spoofing remains possible:** static photographs passed the current
  brightness/texture heuristic and obtained a face-login session during QA.
  Detection and matching work, but face-only login needs stronger liveness
  verification or another authentication factor. Actual camera accuracy with
  enrolled library members remains unverified.
- **Email/SMS delivery is not integrated:** public password-recovery requests
  direct users to a librarian. Staff can issue temporary password resets;
  notifications currently appear in the application.
- **Recommendations use database rules:** categories and recent borrowing counts
  drive suggestions; the system does not train an ML recommendation model.
- **InsightFace is optional:** the included deployed runtime uses dlib. Selecting
  InsightFace requires its separate dependencies and model setup.
- **Design documents can describe planned work:** files under `docs/superpowers/`
  are specifications/plans, not proof that a feature is implemented.
