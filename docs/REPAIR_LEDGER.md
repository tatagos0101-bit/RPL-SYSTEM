# Repair ledger — fixing-the-issue

Base: main `8975023`. Work is isolated from pending PAD. No production rollout
is authorized by this repair cycle. Each tested issue is committed independently.

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

## Release prerequisites

Prepare additive migrations and collision/overcommit preflight. Never silently repair
historical records. After separately authorized release: migration, backend, frontend,
then smoke checks. Redis/runtime-role cutovers, PAD acceptance, biometric policy,
message delivery and new operational workflows remain separate.
