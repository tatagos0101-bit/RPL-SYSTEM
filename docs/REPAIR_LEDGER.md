# Repair ledger — fixing-the-issue

Base: main `8975023`. Work is isolated from pending PAD. Each tested issue was
committed independently. The later October 21 authorization, recovery rehearsal,
main merge and live rollout are recorded in [release evidence](REPAIR_RELEASE_2026-10-21.md).
Earlier entries below retain the state at the time of their checks.

## Acceptance contract

Five combined commitments per member: active/overdue loans plus ready/pending
reservations. Selections hold no stock. Atomic confirmation protects title-level
capacity; queue acceptance is explicit. Ready holds expire after 24 hours.
Website face login authenticates only; station scans record attendance.

## Completed repairs

- Profile: explicit null/empty phone and address clear values; omitted fields persist.
- Reports: reject unsupported years before date arithmetic; count actual active loans
  for borrowed stock; denied attendance does not count toward member progress.
- Profile address validation matches the existing 120-character database column.

Regression evidence: `backend/tests/test_repair_basics.py` reproduces the previous
behavior and asserts corrected results. No schema migration in this batch.

Commit `3b9aa27`: contained corrections; 8 focused regression tests passed.

Authentication batch: normalized case-insensitive identity lookup rejects collisions;
central password policy and bcrypt-SHA256 hashes preserve legacy verification;
long legacy passwords require replacement; suspension revokes sessions. Login and
suspension serialize on the account row. Seed and librarian temporary passwords use
the same hashing policy. 44 authentication, reset, session and station-PIN tests passed.
Email uniqueness migration and PostgreSQL concurrency verification follow in the
database batch; these application checks alone do not prevent signup races.

Commit `dc34712`: authentication backend. Frontend follow-up isolates member and
anonymous selections and waits for server-confirmed logout. Retry leaves credentials
and selections intact on failure. Password forms use the shared policy. Node helper
tests, lint, build and build-secret scan passed. Browser plugin not available;
Playwright with installed Edge verified failed logout → retry → login and cart
clearing at 320, 390, 768 and 1440 pixels, with no overflow or runtime errors.

Commit `114530e`: confirmed logout, isolated selections and shared frontend password policy.

Import/upload batch: workbook rows use individual-book validation and per-row
savepoints, retaining original row numbers and counting only successful rows.
Full import accepts `.xlsx`; browser ISBN extraction retains `.xls` support.
Single-book creation and physical copies now commit together. Repeat avatar
finalization preserves the current object; cover cleanup follows commit and skips
shared references. A saved book with a failed cover upload exposes cover-only retry.
Notification text fields widen additively to `TEXT` for long titles/names/issue notes.
`test_repair_imports.py` and cloud tests cover rollback, shared covers and upload
retry. Disposable PostgreSQL additionally executes a real failed statement in the
middle import savepoint and verifies both neighboring valid rows persist.

Commit `cedeb06`: import/upload repairs, notification text migration and accurate
inventory borrowed counts. Full backend regression passed with this batch included.

Attendance/account follow-up: website face login no longer creates either granted
or denied attendance records. Station transitions lock members in stable order and
write aware Philippine timestamps, preserving legacy interpretation. PostgreSQL
round-trip and overlapping-scan tests pass. Input limits match account columns;
signup conflicts return a safe error. New-password Unicode digit handling now
matches the frontend policy; legacy login size regression uses the separate bound.

Commit `b37282e`: attendance and account-input follow-up.

Reservation integrity batch: centralized five-slot accounting, member-first and
ascending-title locks, explicit queue agreement, FIFO promotion of all free capacity,
24-hour ready holds, pickup conversion and atomic member-scoped confirmation IDs.
Legacy single reservations and librarian cancellation use the same services.
Walk-ins/stock reductions cannot consume ready holds. History prevents deletion.
New partial uniqueness/FIFO indexes and confirmation storage are additive; preflight
aborts on conflicting identities, duplicate active reservations or overcommitted holds.
Runtime-role preparation/checks include all 15 tables and preserve browser denial.

`test_repair_reservations.py` covers five reservations, three loans plus two
reservations, five loans, preserved over-limit history, pickup conversion, explicit
queue conflicts, batch rollback, duplicate request IDs, cancellation, expiry,
stable deadlines, FIFO priority, multi-slot promotion, stock reduction and ownership.
`test_repairs_postgres.py` uses an explicitly disposable localhost database: repeat
migrations/runtime grants, real import savepoints, two readers competing for one
copy, two tabs competing for quota, borrow versus reserve for the fifth slot,
same-ID retries, aware timestamps and overlapping scans all pass. PostgreSQL
NO KEY UPDATE member locks also permit notification FK KEY SHARE during promotion;
a dedicated overlap test guards against that deadlock.

Commit `a4f86c7`: quota, reservation, inventory and database integrity batch.

Retrieval backend: shared searchable member/transaction queries, stable pagination
ordering, independent count endpoints, on-time totals, and stable catalog ordering.
Librarian registration fields match column limits and concurrent conflicts are
reported safely. Reminder delivery returns 501 instead of reporting a fictitious
success. A synthetic dataset of 1,005 books, 205 members and 205 historical loans
verifies search beyond old first-page limits, last pages, totals and role denial.
Focused retrieval/authentication regression: 9 passed.

Commit `e464d5e`: retrieval APIs and unavailable reminder delivery.

Interface reliability batch: server pages replace fixed first-100/1,000 lists;
search, filters and counts cover the full dataset. Independent dashboard sections
render successes even when another request fails. Report export safety caps now
raise an explicit error. Notifications update only after server confirmation.
Shared native dialogs contain/restore focus and support Escape; the application
error boundary offers recovery. Book-slot usage appears in member browsing,
reservations and librarian circulation. Unknown reservation outcomes preserve the
same confirmation ID across reloads; circulation stops on an unknown write and
keeps successful/unattempted items visible for reconciliation.

Browser evidence: local Vite app, synthetic intercepted APIs, Playwright with
installed Edge (Browser plugin unavailable), at 320, 390, 768 and 1440 pixels.
Checked queue agreement after availability conflict, unknown confirmation/reload/
safe retry, cancellation/Escape, member/public catalogs, inventory/member/transaction
pagination, loan-page failure/retry, long titles/names, cover-only retry, scanner
manual-ID flow, five-slot display, focus restoration and unknown circulation outcomes.
The 320px loan screen's clipped search/numbers were found visually and corrected.
Reruns showed no page overflow or unexpected browser runtime errors. Synthetic
screenshots were inspected locally and are excluded from Git.
Landing-page book dialogs also passed Escape/focus restoration. Deliberately
malformed synthetic count data triggered the error boundary; safe reload recovered
at all four widths. This intentional failure was separate from normal-flow checks.

## Validation summary

Commit `a7b1625`: reservation interface, responsive retrieval, retry/error recovery
and shared dialog behavior. The final documentation commit records setup,
architecture, migration requirements and the prepared release sequence.

- Full backend suite: **192 passed, 1 skipped**, including the isolated repair
  PostgreSQL acceptance test. The skip is the separate recommendation PostgreSQL
  test, whose dedicated environment was not configured in this repair run.
- After final lock/retrieval refinements: **10 reservation/PostgreSQL** and
  **9 retrieval/authentication** focused tests passed.
- Frontend helper/build-scanner tests: **60 passed**. ESLint and production build
  passed; built-artifact credential scan passed for all 67 output files.
- Browser scenarios above passed at all four widths using synthetic responses.
  No production patrons, biometrics, database or Storage objects were accessed.
- Existing dependency/deprecation warnings remain; no dependency upgrades were
  made for this repair batch. No backend lint command is configured.

## Release prerequisites

The additive migration and collision/overcommit preflight are implemented and locally
validated. The [rollout checklist](REPAIR_ROLLOUT.md) is prepared, not executed.
Production-shaped migration rehearsal, production role/access checks and live smoke
checks remain release gates. Never silently repair historical records. After separate
authorization: migration/runtime access, backend, frontend, then smoke checks.
No merge, push, deployment or production infrastructure changes were performed.
PAD camera acceptance, biometric policy, real notification delivery, Redis/runtime-role
cutovers and damage-management workflows remain separate projects. Circulation carts
remain per-item; only reservation confirmation is an atomic batch. Expiry is
request-driven, and durable offline transactions are not implemented.


## Follow-up: 12 confirmed defects (October 18, 2026)

Source: the **Reclone RPL-SYSTEM repository** thread's re-audit of `d4c1f90`.
The earlier validation summary applies to that earlier batch; it did not close
these twelve findings. This follow-up closes them in the local repair branch.

| # | Severity | Confirmed defect and correction | Evidence |
| --- | --- | --- | --- |
| 1 | High | Bulk ISBN categories contained `{matched,isNew}` objects. Rows now store the matched string. | Inventory helper tests; rendered lookup/import |
| 2 | High | Array/object validation errors crashed bulk error handling. Normalize errors to safe text. | Array/object helper tests; synthetic 422 in browser |
| 3 | High | Lost book/import responses could duplicate non-ISBN titles. Persist request IDs, atomically commit server receipts, bind workbook bytes by SHA-256, and reconcile before retry. | Non-ISBN replay, owner/role/suspension, rollback, consumed-upload replay; PostgreSQL simultaneous retries; reload recovery |
| 4 | Medium | ISBN successes were not retained per row. Persist confirmed outcomes and frozen retry payloads; exclude successful/skipped rows from retries. | Browser partial success → reload → unresolved-only retry |
| 5 | Medium | Reservation read/cancel failures were silent. Show errors/retry, preserve rows until confirmation, and reload counts after success. | Failed read/cancel, refresh and confirmed cancel in browser |
| 6 | Medium | QR reads/downloads silently failed. Distinguish loading/error/empty and retain selection with retry. | Failed load/download → retry in browser |
| 7 | Medium | QR loading stopped at 10,000 copies. Add search/count pagination and explicit complete identity snapshot; fetch 200-label PDFs and assemble a complete ZIP. | 10,001-copy backend and frontend batch tests; ZIP CRC/binary/Unicode cross-check with Python; paged browser export |
| 8 | Medium | Empty selection implicitly exported all. Reject empty selected requests and provide a separate all-matching operation. | Backend empty/missing-ID tests; disabled empty-selection export in browser |
| 9 | Medium | Checkout displayed fixed loan/fine settings. Read backend policy and a Philippine-time due-date preview; offer retry and disable borrow confirmation while unavailable. Existing fine-visibility preference is preserved. | Nondefault 21-day/7.5 policy API test; rendered 21-day preview and retry |
| 10 | Medium | Landing books and remaining category loads hid failures. Show explicit retry controls; retain existing usable state. | Add-book/public categories and landing failure/retry in browser; shared category hook for member catalogue |
| 11 | Low | Member lists/stats performed per-member queries. Aggregate page loan counts and active embedding flags; aggregate overall statistics. | Constant SELECT count for 1 versus 25 members; returned history and inactive/duplicate synthetic embeddings |
| 12 | Low | Librarian reservations were unpaginated. Add stable server paging/search/counts and page controls; clamp the page after deletions. | 205-row backend dataset; next page and last cancellation → page one in browser |

Verification actually run:

- Full backend regression: **199 passed, 2 skipped**. The repair PostgreSQL test
  then passed separately against disposable localhost PostgreSQL 17, including
  repeat migration, existing rows, preflight refusal, runtime grants/RLS, quota,
  circulation, station locks and competing non-ISBN writes. The remaining skip is
  the optional recommendation PostgreSQL benchmark; its separate database was not
  available in this follow-up. Docker became unavailable when preparing that
  additional database; this does not invalidate the already completed checks.
- After bounded QR export replaced the one-request ZIP implementation, all **8**
  focused follow-up backend tests passed again. The 10,001-label routing test mocks
  PDF rendering to assert complete identity coverage; it is not a 10,001-label
  rendering benchmark. No claim is made about live export latency or hosting limits.
- **68** frontend/helper/build-secret tests passed. ESLint, production build and
  built-artifact credential scanning passed (68 output files).
- `python scripts/run_security_integration.py` passed against disposable local
  PostgreSQL/Redis: additive upgrade/history preservation, browser denial, runtime
  CRUD/admin denial, session binding/revocation, overlapping circulation and shared
  rate-limit/outage rejection. Its allowlist now includes repair dependencies and
  the receipt model. The runner removed only its own containers/volumes.
- Browser plugin unavailable; installed Edge/Playwright tested the built preview
  at `http://127.0.0.1:4179`, widths **1440, 390, 320** and height 900. API responses,
  books and users were synthetic; camera hardware was not used. Page identity,
  meaningful rendering, absence of framework overlays, interactions and screenshots
  passed. No unexpected runtime/console errors or API calls were observed; the
  injected 404/422/503 and aborted responses produced expected network errors.
  Screenshots outside Git were inspected after finishing animations. These are UI
  checks, not live production/database or physical-camera acceptance.

The next recommended step from the thread—affected regression checks followed by
migration/release preparation—has been performed locally. The updated rollout
requires `inventory_writes` and runtime access to all **16** application tables.
Production-shaped restored-database rehearsal, maintenance-window approval and
live smoke checks remain outstanding. No main merge, push or live deployment was
performed. PAD source/assets and the user's other worktrees remain unchanged.

Operational limits: request recovery needs the same account and retained browser
request state; clearing it or creating a new intent is not the same retry. Receipts
must survive migrations. Complete QR exports hold assembled PDFs in browser memory
and fail visibly on standard ZIP size limits or any missing/failed batch. Quotas,
loan history, private storage and existing fine visibility remain in force. This
batch changes no dependency pins and does not alter the approved setuptools exception.

## Subsequent frontend security release — October 19, 2026

The [frontend credential cleanup](FRONTEND_CREDENTIAL_CLEANUP.md) released only the
build guard from deployed baseline `8975023`, as frontend commit `c18c05b`. The
frontend Supabase connection and its 16 variables were removed; API configuration
metadata and deployment were preserved. It did not release the repairs above.
The guard/evidence are retained in this branch by merge `f585fcc`. Combined frontend
verification: 74 tests, lint, production build and artifact scanning passed.
GitHub main was not pushed; repair migrations and the repair rollout remain pending.
