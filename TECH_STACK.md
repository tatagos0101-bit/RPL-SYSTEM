# Technology stack

Source-based overview inspected October 14 and checked against main on October 15, 2026.
This is not verification of the deployed revision or live cloud configuration.

| Layer | Implementation |
| --- | --- |
| Frontend | React 19 with JavaScript/JSX, Vite 7, Tailwind CSS 4, React Router 7, Axios, and react-webcam. |
| Backend | Python 3.11–3.12, FastAPI, Pydantic, SQLAlchemy 2, and Uvicorn. Python 3.12 is selected for Vercel. |
| Production data | Supabase PostgreSQL through SQLAlchemy/psycopg with TLS and transaction-pooler settings. SQLite and MySQL remain local development options. |
| Authentication | FastAPI-managed bcrypt passwords and JWTs; HttpOnly browser cookies with legacy bearer compatibility. Supabase Auth is not used. |
| File storage | Supabase Storage: public catalog covers; private avatars, government IDs, and imports. FastAPI authorizes uploads and private viewing links. |
| Facial recognition | face-recognition/dlib with optional InsightFace; OpenCV, NumPy, and Pillow support image processing. |
| Presentation checks | Main uses brightness/texture heuristics that static photos can pass. Separate uncommitted MiniFASNet ONNX work is excluded from this release; physical-camera acceptance remains pending. |
| Library tooling | Physical-copy QR labels via qrcode, workbook parsing via openpyxl, PDF generation via ReportLab, and browser CSV/print exports. |
| Recommendations | On-demand item-based collaborative filtering (cosine similarity), with author/category and popularity fallbacks. Favorites, views, and loans are aggregated in SQL; no external AI service or separately trained model. |
| Deployment | Vercel frontend and FastAPI configurations with Supabase persistence; Docker/Railway artifacts also remain. |
| Verification | pytest backend regressions, Node's built-in frontend helper tests, ESLint, and Vite build. |

Implemented workflows include public catalog browsing, member/librarian portals,
attendance, copy-aware borrowing/returns, reservations, and reports. Book-condition
photos and durable offline synchronization are not implemented. Email/SMS recovery
delivery is also absent; operational resets are librarian-assisted.

See [architecture, source references, and limitations](docs/ARCHITECTURE.md),
[agent instructions and check commands](AGENTS.md), [local setup](README.md), and
[deployment documentation](docs/DEPLOYMENT.md). Dependency manifests and lockfiles
are the source of truth for exact versions; historical plans do not establish
feature completion.
