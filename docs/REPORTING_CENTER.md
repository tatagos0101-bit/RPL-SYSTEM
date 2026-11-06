# Analytics and reporting center

Implementation in the `library-reporting` worktree, based on main `2dd95d0`.
This document describes source and isolated validation, not a production release.
No production migration, deployment, commit, or push is included.

## Staff experience

`/librarian/home` now provides ten linked measures, period comparisons, attendance
and circulation trends, current collection status, title rankings (including zero
borrows), acquisition coverage, alerts, and recent activity. The existing drawer,
theme tokens, font stack, member-registration workflow, and operational routes
remain. The homepage has a fixed current-month overview and no filter controls. Refresh
occurs on page entry, registration, or manual refresh; chart queries are no longer polled every ten seconds.

`/librarian/reports` retains the original Reports layout: header export actions,
Borrow / Return and Entry Gate shortcuts, a filter panel beside the Monthly PDF
card, four compact record/period cards, and a table preview. The additional report
categories remain available in the filter selector. There is no replacement
Summary / Charts / Detailed Records tab layout.

Category-specific filters can be combined, applied/reset, and shared through the
URL. Applying filters clears the previous preview while loading and updates the
detailed rows, record count, period cards, and download context together. Unapplied
changes disable downloads and pagination. Date presets include Yesterday; date
changes switch registration/catalog/acquisition scope to the selected period.
Details support allowlisted sorting, stable ID tie-breakers, and 25/50/100-row
server pages. Header CSV, Excel, PDF and Print actions use all matching records,
not just the visible page. CSV includes filter metadata as a separate ZIP entry.
Dashboard charts retain native SVG and accessible data alternatives.

Library programs/activities and detailed staff qualifications are **excluded**.
There are no program, participation, personnel-qualification, or staff-profile
modules or selectable profile worksheets. Excluded-feature notices and placeholder worksheet rows are omitted from the UI,
metadata, and exports. Unknown values within supported records (such as missing
acquisition dates) are still labeled accurately.

The Monthly PDF card downloads the complete categorized library report through
`GET /api/reports/monthly`. Its month/year are independent of the detail-preview
filters. The owner-scoped patron transcript remains unchanged.

## Metric definitions

| Measure | Source and boundary |
| --- | --- |
| Registered patrons | Non-deleted member accounts registered by evaluation time; an as-of snapshot, not an activity classification. |
| Visits / visits today | Granted `entry_logs` sessions. Denied detections are excluded. The reporting layer does not merge or reconstruct sessions. |
| Identified unique visitors | Distinct non-null recorded user IDs. Unidentified sessions are separate and cannot establish unique people. |
| Returning / first recorded visitors | Whether the identified visitor has a granted session before the selected period. First recorded does not mean first-ever. |
| Average daily visits | Granted sessions divided by elapsed calendar days, including zero-visit dates and the partial current date. |
| Borrows / returns | `transactions.borrow_date` / `return_date` respectively, regardless of the row’s current type. One loan item counts once. |
| Outstanding / overdue | Borrowed by evaluation time and not yet returned; overdue additionally requires a stored due date before evaluation time. No synchronization writes. |
| Return timeliness / mean duration | Period returns against stored due dates; invalid/missing borrow-return pairs are excluded from duration and counted. Missing due dates are disclosed separately. |
| Titles / holdings | Catalog IDs / non-retired physical copies. Retired copies remain separately visible. Collection details retain titles without copy records with empty copy fields. |
| Category, author, popularity | Current catalog metadata; historical category-at-borrow is not stored. Title rankings distinguish IDs with identical names. |
| Acquired copies | Existing copies with staff-recorded acquisition dates in range; unknown dates do not enter dated totals. Newly cataloged titles are separate. |
| Inventory discrepancies | Recorded title totals/availability versus copy aggregates and outstanding loans. Results flag review; they never repair stock. |

All boundaries are Philippine time, start inclusive and next boundary exclusive,
capped at the report evaluation time. PostgreSQL timezone-aware values and legacy
timezone-less Philippine values are handled by the existing date convention.
Complete calendar periods compare with the preceding calendar period. Partial
periods compare matching elapsed portions; unequal coverage suppresses percentages.
Zero prior counts have no percentage baseline. Date-only acquisitions do not make
partial-day percentage claims. Historical coverage cannot be independently proven
from these records.

Acquisition coverage counts include catalog-filtered copies independently of
source/date filters. All-date acquisition details can therefore include records
outside the selected period; the monthly chart still describes the selected period.
Ranked charts are bounded; detail exports contain every matching record within the
explicit export limit. PDF/print charts show up to four charts and label their
first-eight-point display; their detail tables are not silently truncated.

## Acquisition entry connected to inventory

Manual Add Book and ISBN-batch imports accept optional acquisition source, date,
donor/supplier, cost per copy, currency and reference. Details apply to every new
copy in that submission; different sources should use separate submissions or
per-copy edits. Creation and acquisition metadata share the existing inventory
transaction and idempotency receipt. A retry retains the original source details.
Workbook rows support optional `Acquisition source`, `Acquisition date`,
`Donor / supplier`, `Cost per copy`, `Currency`, and `Acquisition reference` columns.
Invalid acquisition fields reject that row; earlier valid rows follow the existing
partial-import behavior. Missing acquisition fields remain Unknown.

Increasing Total copies in Edit book exposes acquisition fields for the additional
copies only. Existing, retired and backfilled legacy copies are never relabeled.
Admin inventory uses librarian-protected `GET /api/inventory/books`, supporting
source/search/category filters and batched source counts for current copies.
`GET /api/inventory/books/{book_id}/acquisitions` pages through physical copies,
including retained retired identities. Its editor uses the same version-checked
acquisition records as Reports. Public catalog responses remain unchanged and do
not expose donor/supplier or cost. No extra schema beyond `copy_acquisitions` is
required for this integration; the reporting migration is still a release prerequisite.

## APIs, contexts, and exports

All `/api/reporting/*` routes require the existing librarian/session dependency,
including suspended/deleted-account and forced-password-change restrictions:

- `GET /metadata`: categories, filter choices and coverage explanations.
- `POST /dashboard`: selected-period aggregates, comparisons, series, alerts.
- `POST /query`: normalized filters, summaries, charts, totals, page, context.
- `POST /export`: PDF, XLSX, CSV bundle, or print HTML from that context.
- `GET/PUT /acquisitions/{copy_id}`: read/edit metadata for an existing copy.
- `POST /acquisitions/import-preview` and `/import-apply`: validated atomic import.

A signed, actor-bound report context includes normalized-filter hash, evaluation
time, a fingerprint of safe projected rows/aggregates/charts, and a 30-minute
expiry. Pagination and exports revalidate it. Relevant changes return HTTP 409 and
require Apply filters again. Evaluation time is not presented as an immutable
historical snapshot. PostgreSQL projection, fingerprint and export materialization
run in one read-only REPEATABLE READ transaction. No archive is created.

Detail queries use explicit projections; they exclude patron names/contact details,
biometrics, private asset URLs, credentials and security snapshots. Necessary member
identifiers are blanked for deleted accounts. All mutations remain server-side.

Exports support full details, summary only, and clearly labeled current page:

- PDF: ReportLab, period/filters/evaluation/generation metadata, summary, selected
  charts, repeated table headings and page numbers; wide tables are split into
  column groups with repeated identity.
- XLSX: metadata, summary and detail sheets; explicit text, date and numeric cells.
- CSV: a ZIP containing UTF-8 `records.csv` and `report-metadata.txt`, so filter
  metadata does not corrupt a rectangular table. Formula prefixes are protected.
- Print: escaped standalone HTML without application controls or navigation,
  print CSS and repeated table headings. A blocked popup falls back to HTML download.

Queries reject more than 100,000 matching records; full detail exports reject more
than 20,000. Charts reject over 400 time intervals and request coarser grouping.
Imports accept at most 500 rows, 1 MB compressed input, and 10 MB XLSX expanded
content. Errors never return a partial export. Cancelling an export stops the
browser request/download; it does not promise cancellation of already running
server-side rendering.

## Acquisition records and migration

`copy_acquisitions.copy_id` uniquely references an existing physical copy. Fields:
nullable source (`purchased`, `donated`, `other`), verified acquisition date,
donor/supplier, cost/currency, reference, and recording/updating staff/timestamps.
Missing metadata remains Unknown. No legacy source/date is inferred from catalog
or copy creation timestamps, and newly created stock remains unknown until entered.

The editor first loads a physical copy. CSV/XLSX preview validates identifiers,
duplicates, types, nonnegative cost with currency, dates, and spreadsheet formulas.
Apply binds the reviewed rows to a signed preview. Row locks and expected versions
reject competing edits; all import rows commit together. Blank import fields clear
existing metadata, as disclosed before Apply. These operations never resize stock,
create copies, alter QR identities, or modify loan history.
Retiring a copy retains its metadata. If the existing inventory workflow permits
physical deletion of a title without loan/reservation history, its acquisition
metadata is deleted with its copies. Historical-loan/title deletion guards remain
unchanged; acquisition metadata is not a permanent report archive.

The scoped additive migration is `backend/migrate_reporting.py`, invoking
`services/reporting_migration.py`. Existing full initialization also registers the
model and applies the reporting upgrade. The scoped command does not invoke the
copy/category/biometric backfills in the general `migrate.py`.

On an **explicitly approved** migration-owner connection, from `backend/`:

```powershell
uv run python migrate_reporting.py
```

Do not run that command against production without separate approval. Keep
`AUTO_MIGRATE=false`; no new environment variable or dependency is required.
Apply the schema before releasing the reporting API/frontend. The restricted
runtime cannot perform DDL. The upgrade enables RLS, revokes PUBLIC/browser-role
access and grants CRUD only to an existing `rpl_app_runtime` group, validating its
acquisition policy. Fresh runtime-role preparation includes the new table.
No applied initial Supabase migration was regenerated.

Four PostgreSQL indexes were retained from isolated query plans: granted session
date, granted user/session history, loan borrow date, and non-null return date.
The acquisition date index belongs to the new model. Existing book/copy relationship
indexes are reused; a proposed book/borrow index was not retained after batched
aggregation removed its need. Index creation is transactional, not concurrent;
an approved production rollout must schedule for index-build locking and inspect
real query plans/data volume separately.

## Categorized monthly PDF

NLP preparation is removed from the UI, metadata, and reporting API category list.
The Monthly PDF card provides one monochrome document containing Library usage,
Circulation, Patrons, Collection, Acquisitions, and Inventory. Each category has
summaries, tabular breakdowns, and all matching safe detail columns/rows. Long
tables repeat their category name and headers; wide tables repeat the stable ID
across column groups. Every page includes the report month and page number.

Attendance, circulation activity, and dated acquisitions use the selected Philippine
calendar month, capped at generation time. Patron accounts, collection and inventory
are current snapshots, explicitly labeled. Outstanding loans, denied entry attempts,
and unknown-date acquisitions have separate subsections; they are not added into
monthly activity totals. Public use is not inferred from borrowing. Existing safe
projections exclude credentials, contact details, biometrics and security snapshots.

Monthly generation uses the same read-only database snapshot as reporting. It
never runs overdue/reservation synchronization. A combined limit of 20,000 detail
rows fails clearly before PDF generation; no rows are silently omitted. Staff can
use narrower category reports if the complete monthly document exceeds this limit.
The PDF is an internal library record, not a claim of official-form compliance.

## Validation and limits

Regression coverage is in `backend/tests/test_reporting_center.py`,
`backend/tests/test_reporting_postgres.py`, and
`frontend/src/api/reportingFilters.test.js`. The PostgreSQL test requires an empty
database named `rpl_reporting_test` on localhost via `REPORTING_TEST_DATABASE_URL`;
it refuses remote/nonempty targets and owns only that disposable database.

Validated with synthetic records: historical returned loans, granted/anonymous
visits, unique/returning visitors, leap days and Philippine boundaries, partial
comparisons, unknown acquisition data, mixed sources, duplicate/invalid imports,
version races, stable pagination, stale contexts, exports beyond 5,000 rows,
formula/HTML escaping, workbook types, PDF text, account restrictions, repeatable
migrations, runtime grants/RLS and consistent snapshots. A PostgreSQL dataset of
40,000 visits, 20,000 loans and 3,000 copies exposed repeated correlated scans;
batched aggregation reduced local dashboard time from about 10.6 seconds to
0.2–0.3 seconds. These are local observations, not production performance claims.

Browser validation uses an isolated local FastAPI/SQLite database with synthetic
records and the real frontend. Existing face/QR/circulation implementations were
not modified; real-camera accuracy and deployed PostgreSQL/Storage were not tested.
Production schema completeness, data coverage, runtime grants and deployment remain
separate approval/verification steps.

## Changed source map

| Area | Files |
| --- | --- |
| Dashboard and reports | `frontend/src/pages/lib/LibDashboard.jsx`, `LibReports.jsx` |
| Shared presentation | `frontend/src/components/reporting/ReportChart.jsx`, `ReportControls.jsx`, `ReportResults.jsx`, `AcquisitionEditor.jsx`, `RegisterMemberButton.jsx` |
| Frontend API/date/filter helpers | `frontend/src/api/reporting.js`, `reportingFilters.js`, `reportingFilters.test.js` |
| Reporting APIs and calculations | `backend/routers/reporting.py`, `backend/schemas/reporting.py`, `backend/services/reporting.py`, `reporting_exports.py` |
| Additive storage and permissions | `backend/models/copy_acquisition.py`, `backend/services/reporting_migration.py`, `backend/migrate_reporting.py`, registration in `backend/main.py`, `backend/database.py`, `backend/services/schema_migrations.py`; `supabase/operations/prepare_runtime_role.sql` |
| Monthly library PDF | `backend/routers/reports.py`, `backend/services/report_service.py`, `monthly_report.py`, `report_snapshot.py`; `backend/tests/test_monthly_report_pdf.py` |
| Regression coverage | `backend/tests/test_reporting_center.py`, `test_reporting_postgres.py` |
| Documentation | This guide, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` |

Validation commands used the repository's existing build, lint and helper-test
scripts plus isolated pytest. The full backend suite passed 268 tests with six
opt-in integrations skipped. After final migration/lifecycle changes, 25 targeted
reporting, inventory/retrieval and PostgreSQL tests passed. All 83 frontend helper
tests passed; the production build and lint passed. The skipped cloud/Redis and
unrelated PostgreSQL integration targets were not substituted with production.

Edge/Playwright checks covered both changed pages in light/dark at 390/768/1440 px,
all seven report categories, representative 200% zoom, chart keyboard focus, combined
filters, reset/empty states, sorting/pagination, URL drill-downs, acquisition save/import,
modal Escape/focus restoration, stale export rejection, PDF/XLSX/CSV/print and service
error recovery. No page runtime errors were captured. Sampled heading/body/secondary
text contrast ranged from 5.51:1 to 13.57:1 in light and 7.74:1 to 11.41:1 in dark;
this is representative checking, not a full accessibility certification. The Browser
runtime was unavailable, so the existing local Playwright installation was used.
The registration modal/handlers were source-compared against main: unchanged except
for adapting the success refresh callback. Auth, routing, circulation and scanner
source files were unchanged.

The homepage-filter revision passed build/lint, focused frontend date tests, and
16 reporting backend tests. A dedicated Yesterday-visitors regression checks both
Philippine midnight boundaries, denied sessions, detail rows, chart totals and the
complete CSV export against the same selection.


### Inventory acquisition integration verification

The related follow-up connects acquisition entry to Add Book, ISBN batches,
workbook imports, added copies, and admin inventory. The full isolated backend
suite passed (273 tests, 6 optional integrations skipped). Regression cases cover
atomic creation/retry, mixed sources, retired/legacy copy preservation, negative
cost rejection, workbook row errors, protected reads, and report synchronization.
Browser checks used synthetic local records: manual add → per-copy edit → additional
copies → source-filtered Reports → matching CSV download. ISBN metadata was stubbed;
its acquisition write and the workbook upload used the actual local API. Add Book
and inventory passed 390/768/1440px checks in both themes with no page errors.
Production schema, cloud permissions, and deployment were not changed or reverified
by this follow-up.


### Monthly PDF consolidation verification

Removed the separate NLP category and worksheet controls. The Monthly PDF card
now downloads the categorized monochrome report, with all supported matching
records and explicit current-snapshot sections. Full backend verification passed
274 tests (6 optional integrations skipped); all 83 frontend helper tests, lint,
and build passed. Tests cover monthly date boundaries, returned borrowing history,
records beyond the previous preview limit, denied entries, read-only behavior,
access restrictions, monochrome PDF operators, and explicit oversized-report failure.

Final browser verification downloaded the PDF from the Monthly PDF card, confirmed
six categories and no NLP option, and checked both themes at 390/768/1440px without
page errors. Every page of the synthetic PDF was rendered to PNG for layout review;
the subsection page-break correction was verified in the final render. PDF length
depends on all matching records and repeated column groups, not a preview-row cap.
No commit, push, migration or production deployment was performed.
