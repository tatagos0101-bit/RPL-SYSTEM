# Repair rollout — prepared, not executed

Branch: `fixing-the-issue`. Local verification is recorded in the
[ledger](REPAIR_LEDGER.md). Production migration, role changes, merge/push and
deployments were authorized by the user on October 21, conditional on completion and safety. The user confirmed no production backup exists, so recovery/rehearsal remains a release gate. Preserve the independent PAD branch.

1. Record the current backend/frontend revisions and an authorized database backup.
   Schedule a maintenance window that stops old API writers: old code does not
   enforce the new quota and hold rules. Keep production `AUTO_MIGRATE=false`.
2. On an isolated restored database, run the existing `backend/migrate.py` path
   with migration-owner credentials, then repeat it. Do not regenerate or reapply
   the initial schema as an upgrade. Local disposable PostgreSQL checks already
   cover repeat execution, existing rows, grants, collisions and concurrent writes;
   the production-shaped rehearsal remains a release gate.
3. Preflight aborts before schema changes on normalized email collisions, duplicate
   pending/ready member-title reservations or overcommitted live ready holds. It
   reports counts without patron identities. Review conflicts privately and agree
   corrections; never delete accounts/history or silently rewrite pickup promises.
   Existing members above five commitments are preserved and blocked only from
   new commitments. No historical attendance timestamps are shifted.
4. Apply the validated migration during the authorized maintenance window. Changes:
   `reservation_confirmations`, `inventory_writes`, active member/title uniqueness, FIFO index,
   normalized-email uniqueness, notification message/name/title `TEXT` fields, and
   nullable `users.deleted_at` for irreversible member identity removal.
   Existing confirmation IDs and historical reservations must survive future upgrades.
5. If using the restricted backend runtime role, apply the reviewed
   `supabase/operations/prepare_runtime_role.sql` update for all 16 tables; verify
   using `check_runtime_access.sql` as that runtime login. The confirmation and inventory receipt
   tables need CRUD through its backend RLS policy; browser roles remain revoked.
   This does not authorize a new runtime-role or Redis production cutover.
6. Deploy the backend, retaining cloud TLS/pooler settings and server-only secrets.
   Check health, cookie login/logout, password replacement, member/librarian/owner
   restrictions, capacity, atomic confirmation/retry and explicit queue conflicts
   using approved test accounts. Never use real biometrics as test fixtures.
7. Deploy the frontend after the API checks. Verify five-slot usage, selection
   disclaimer, safe retry after an interrupted confirmation, 24-hour deadline,
   pickup conversion, return/cancel, cover-only retry and pagination on mobile.
   Also verify lost-response recovery for a non-ISBN book and workbook, partial
   ISBN import retry after reload, configured loan policy, reservation cancellation
   failure/retry, and complete QR export beyond one page. Do not clear pending
   browser inventory recovery state during the rollout. Inspect failed requests
   and confirm successful operations in the ledger.
8. Resume traffic only after the smoke checks pass. If a release fails, stop new
   writes and investigate; rolling back to the old backend would remove hold/quota
   enforcement. Prefer a forward correction. Do not drop additive tables/indexes
   or restore an old backup over newly accepted reservations without an explicit
   data-recovery decision.

The pickup window is fixed at 24 hours; the old `PICKUP_WINDOW_HOURS` environment
override is no longer read. No new secret or paid service is required. Expiry runs
on relevant requests, not a scheduled worker. Email/SMS reminders, PAD camera
acceptance, biometric policy and damage-management workflows remain separate.
