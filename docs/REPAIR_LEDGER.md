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

## Remaining batches

Authentication and account consistency; import/upload correctness; atomic reservations,
quota and holds; attendance correctness; complete retrieval and interface failures.
Database-sensitive changes require isolated PostgreSQL tests before acceptance.

## Release prerequisites

Prepare additive migrations and collision/overcommit preflight. Never silently repair
historical records. After separately authorized release: migration, backend, frontend,
then smoke checks. Redis/runtime-role cutovers, PAD acceptance, biometric policy,
message delivery and new operational workflows remain separate.
