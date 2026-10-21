# Repair release — October 21, 2026

The completed repair batch and member-management fixes were merged through
[PR #1](https://github.com/tatagos0101-bit/RPL-SYSTEM/pull/1), merge commit
`131a601ab4cd200003656083f1949b412c500f8a`. Both production projects reached READY
at that commit: API `dpl_BQ7Squ7UDTDRQhV6dErvMwJMCBXi`, frontend
`dpl_pizpSqMbm2nJYzSkBThyJRDgmVKm`. Later documentation-only deployments may replace
these deployment IDs without changing application behavior.

## Recovery and migration

- Created a PostgreSQL 17 custom-format backup of the application's `public`
  schema, data, sequences, indexes, RLS and grants. Only encrypted bytes were
  written, outside Git in `F:\RPL-Backups`, with restricted Windows ACLs.
- Encryption uses Windows DPAPI CurrentUser. Recovery requires the same Windows
  account/profile and its recovery material. This is a verified local rollback
  copy, not an off-site disaster-recovery service or a full Supabase project backup.
  Storage objects and managed Supabase schemas are excluded. Production Storage
  objects were not changed by the migration.
- Restored the encrypted backup to a fresh local PostgreSQL container with
  RAM-backed database files and loopback-only access. Cloud credentials were not
  supplied to the migration rehearsal. Existing row fingerprints were preserved;
  only missing legacy face embeddings were backfilled from their corresponding
  existing values. A second migration changed no data. The container was removed.
- Paused both public projects, allowed in-flight requests to drain, then created
  a fresh maintenance backup and repeated the restore/migration rehearsal.
- Ran the existing `backend/migrate.py` path twice against production. Existing
  operational records were preserved and the second run was idempotent. Verified
  RLS and revoked browser-role table privileges. `AUTO_MIGRATE=false`, database
  connection selection, Redis configuration and all project environment metadata
  were preserved.
- Promoted and verified the API before resuming the frontend. Merged the exact
  tested branch; Git-triggered builds of merged main also reached READY.

Private operational scripts are under the local ignored `.tools` directory:
`release_recovery.py`, `release_live.py`, `repair_live_smoke.py` and
`repair_release_verify.py`. Do not publish their local environment inputs or
backup contents. Any future production restore requires a separate recovery
decision; do not overwrite transactions accepted after this release.

## Verification

The source commit passed 213 backend tests (four optional checks skipped), 64
frontend helper tests, lint, production build and credential scanning. Disposable
PostgreSQL/Redis checks covered locking, concurrent circulation/deletion, repeat
migrations, runtime permissions and fail-closed rate limiting.

Live API acceptance used only temporary synthetic accounts, a book, attendance,
loans, reservations and a generated solid-color avatar. Verified:

- Secure/HttpOnly/SameSite cookies, wrong-role and anonymous denial, required
  password replacement, old-session revocation, and wrong-portal login preserving
  the existing cookie.
- Private avatar upload, password-confirmed face deletion and session revocation.
- Inventory idempotency and receipt lookup; reservation retry preserving its ID
  and expiry; cross-owner denial, explicit queue agreement and queue promotion.
- Borrow/return preserving the original loan and physical-copy identity;
  outstanding loans blocking account deletion; completed history and attendance
  retained after identity removal; the synthetic private avatar actually removed.
- Deleted accounts could not be reactivated; suspended sessions and logout were
  rejected. Synthetic records and files were cleaned up.

Live frontend assets were checked in installed Edge through Playwright because
the Browser plugin was unavailable. UI checks used synthetic API responses and a
canvas camera; live API acceptance above was separate. Desktop 1365×900 and mobile
390×844 passed capture/retake/enroll, missing-frame feedback, camera-denial retry,
deletion confirmation and loan blocking. Two tabs synchronized login and logout
without refresh. Page identity, meaningful rendering, absence of error overlays,
screenshots and interactions passed; no page runtime errors occurred.

## Remaining limits

Physical-camera recognition and PAD acceptance remain pending. One browser
profile still shares one account cookie; independent simultaneous accounts need
separate browser profiles. The UI fix synchronizes tabs with that shared session.

The fresh Dependabot lookup returned three medium-severity alerts, all setuptools,
with no high or critical alerts. The previously approved compatibility exception
remains. Supabase's security advisor returned two informational RLS/no-policy
notices for the new backend-only receipt tables; browser grants remain revoked.
The current owner connection works; restricted-role grants and cutover remain a
separate pending implementation.

PAD source/assets, shared Redis activation, restricted-runtime cutover, credential
rotation and unspecified policy/features were not included. This release does not
close those items or establish biometric security/accuracy certification.
