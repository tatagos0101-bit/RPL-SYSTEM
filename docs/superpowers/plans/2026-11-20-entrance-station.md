# Entrance Station Implementation Plan

## 1. Project Overview

The Rizal Provincial Library entrance station records member attendance from camera scans and gives staff a manual workflow for new or unrecognized visitors. The page keeps the camera visible during recognition feedback and accommodates group arrivals. Staff can record a visitor's name and location, then close that exact visit at departure.

[Entrance station design](../specs/2026-11-20-entrance-station-design.md)

## 2. Goals and Success Criteria

- The active video remains mounted during darkness, missing or unrecognized faces, liveness guidance, service errors, and manual entry.
- Group frames retain per-face feedback and attendance for individually eligible members.
- An authorized staff member can enter a visitor name and location and record an exit against the resulting visit ID.
- Retrying the same normalized create preserves the original row and timestamp. Repeated exit preserves the original time-out.
- A repeatable additive upgrade preserves legacy attendance rows. PIN rejection and camera lifecycle regressions have automated coverage.

## 3. Tech Stack

| Layer | Existing stack |
| --- | --- |
| Frontend | React JSX, Vite, Tailwind, Axios, Node.js 22.12 or newer |
| Backend | FastAPI, Pydantic, SQLAlchemy, supported Python 3.11â€“3.12 |
| Database | Isolated SQLite for routine tests and Supabase PostgreSQL as the production target |
| Authorization | Existing per-request station PIN for kiosk traffic and FastAPI account authorization for librarian reads |
| Hosting and CI/CD | Existing repository deployment configuration and test/build commands. No hosting or pipeline changes. |

## 4. System Architecture

The station keeps persistent camera, scanning, guidance, and manual form state in the existing React page. Its API helper attaches the station PIN to FastAPI kiosk requests. Manual writes use SQLAlchemy transactions against the same attendance table as scans. Librarian and kiosk log serialization expose optional visitor fields while keeping member attribution.

## 5. Feature List

| Feature | Description | Priority | Complexity |
| --- | --- | --- | --- |
| Continuous preview | Walnut and amber layout with guidance and results below video | MUST HAVE | Medium |
| Group attendance | Keep per-face boxes, feedback, and presence rearming | MUST HAVE | Medium |
| Manual time-in | Validate name and location and return recorded visit | MUST HAVE | Medium |
| Manual time-out | Close exact open visitor visit and display server timestamp | MUST HAVE | Medium |
| Recent attendance | Show station records and open manual visitor actions | MUST HAVE | Small |

## 6. Data Models

Extend `EntryLog` with nullable `visitor_name` (150 chars), `visitor_location` (200 chars), and canonical UUID4 `manual_request_id` (36 chars, unique index). A visitor row has no user relationship, `entry_type=manual`, `granted=true`, a Philippine time-in, and a nullable time-out. Existing member relationships and rows remain valid. Keep names and locations within authorized attendance responses and synthetic fixtures.

## 7. API Endpoints

| Method and path | Behavior | Authorization |
| --- | --- | --- |
| POST /api/kiosk/face | Existing group scan and individual attendance | Station PIN |
| GET /api/kiosk/entry-logs | Return entries with optional visitor fields | Station PIN |
| POST /api/kiosk/manual-entries/search | Body `{open_only,search,skip,limit}` returns paginated visits across days as `{items,total}`; visitor search stays out of URLs | Station PIN |
| POST /api/kiosk/manual-entries | Accept UUID4 `request_id`, trimmed `visitor_name` and `visitor_location`; return EntryLogOut | Station PIN |
| POST /api/kiosk/manual-entries/{id}/exit | Set time-out once on the exact granted manual guest entry and return EntryLogOut | Station PIN |
| GET existing librarian entry-logs route | Include optional visitor fields on authorized reads | Librarian account |

Reject blank or oversized normalized values with 422 and conflicting UUID reuse with 409. Use a 404 for missing or ineligible exit IDs. Face member records and legacy records without visitor metadata are ineligible.

## 8. Development Phases

- [x] **Phase 1 â€” Working manual attendance path.** Add model columns and an explicit idempotent index upgrade in `backend/models/entry_log.py` and `backend/services/schema_migrations.py`. Exercise old rows, repeated upgrades and duplicate UUID rejection in `backend/tests/test_manual_visitor_schema.py`. Add schemas and serialization in `backend/schemas/librarian.py` and the affected routers. In `backend/routers/kiosk.py`, use the existing PIN dependency. Resolve concurrent creates using the unique constraint and reread after rollback. Close eligible rows with a guarded update on null time-out and reread the winner. Wire both actions through `frontend/src/api/entryStation.js` and the station page, keeping a stable key with the submitted draft through an uncertain response.
- [x] **Phase 2 â€” Camera-led layout and lifecycle.** Refactor `frontend/src/pages/lib/EntryGate.jsx` with the existing attendance, station state and overlay helpers. Put polite guidance and individual scan results under the 4:3 contained video, preserve mirrored overlays and group presence, and keep the visitor form independent of scan state. Retain explicit camera start, one in-flight scan and Retry-After behavior. Release camera on pause, page hide, navigation, device failure and rejected PIN. Ignore stale async responses across those transitions.
- [x] **Phase 3 â€” Regression and local acceptance.** Extend PIN and attendance coverage for invalid input, duplicate payloads, conflicts, exit eligibility, timestamp preservation, group handling and PAD behavior. Run `uv run --project backend --with pytest python -m pytest backend/tests -q -p no:cacheprovider`, `node --test frontend/src/api/*.test.js`, `npm --prefix frontend run lint` and `npm --prefix frontend run build`. On isolated local fixtures, use approved headless Chrome with a synthetic video track to exercise desktop/mobile, failed recognition while video runs, visitor entry/exit, PIN rejection and camera pause/hide/navigation. Verify log refresh after successful writes. Update linked architecture/setup docs where behavior changes.

## 9. Risks and Open Questions

- Two requests with one UUID can race. Enforce uniqueness in the database and compare only normalized fields after recovery.
- Concurrent exit may race in SQLite, where row locking is ineffective. Guard the write on null time-out and verify idempotent readback.
- A capped recent log can hide an older open visit. Provide a separate open-visits view with search and paging across days, and refresh it on a confirmed write.
- A delayed operation may resolve after the station locks or camera stops. Use per-station generations and AbortController for scans, log reads and manual calls so PIN rejection or lock invalidates every outstanding result. Keep the create draft read-only with its original UUID after an unknown outcome and retry only on explicit staff action.
- SQLite and synthetic video can verify logic and presentation. Record live PostgreSQL concurrency and real camera accuracy as unverified unless separately exercised.

## 10. Suggested First Step

Run the isolated schema regression against a pre-upgrade attendance table, then implement the nullable columns and unique index through the existing additive upgrade path. Preserve unrelated edits and leave production migration, deployment, commit and push pending separate authorization.
