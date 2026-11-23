# Inactive member account review

## Policy

After **six calendar months without recorded activity**, the system can send a friendly notice with **72 hours to respond**. The scheduled check creates notices only. It never deletes a member account. After the response deadline, a librarian must review and approve deletion with their password. The librarian also retains an explicit **Delete account now** action with the existing password/DELETE confirmation and outstanding-book safeguards.

An account with outstanding books cannot be deleted or placed into the inactive-account notice flow. Returning books, new recorded activity, or a member/librarian-recorded response cancels a pending review. Responding does not lift suspension, verify contact ownership, change a password, or erase library history.

## What counts as recorded activity

The latest of account creation, successful sign-in tracking, granted linked library encounters (including exit updates), borrowing/return dates, reservation creation and any retained session creation is used. Anonymous visits are not matched to an account by name. Philippine-time normalization is applied to UTC-aware and legacy timezone-less dates. Calendar-month calculation clamps month ends; it does not substitute 180 days.

Historical sign-in records are incomplete: expired sessions are cleaned and logout/reset removes sessions. The new persistent activity timestamp records future sign-ins and successful linked station encounters. Notices therefore say **last recorded activity**, rather than claiming a complete history of every past visit/sign-in.

## Delivery and replies

Every notice has a durable member-only notification in the account. External delivery attempts email when an address is present. Without email or available email delivery, the notice remains available in the account. SMS sending is removed, and pending legacy SMS notices switch to in-account delivery without a provider request. Contact verification flags are not changed by sending a notice.

- **Accepted** means the configured provider accepted the send, not that the inbox received/read it.
- **Unavailable/failed** means external delivery was not confirmed; the in-app notice is still present.
- **Pending/unknown** means sending has not completed or its outcome could not be established. A claimed uncertain send is never automatically repeated.

The 72-hour window begins when the in-app notice is durably created. Members can sign in, use **Keep my account**, or contact the librarian. Staff can record an email or in-person reply. The system does not read incoming email automatically. An old/repeated response is idempotent and cannot renew activity forever or cancel a newer review.

## Deletion approval and manual deletion

The approval endpoint locks member then notice, refreshes current state and rechecks the original activity snapshot, response deadline and outstanding books. Fresh activity or a prior response prevents approval. The existing deletion service removes personal details/private uploads/face data, revokes sessions and cancels reservations while retaining deidentified historical foreign keys. Storage failures are reported as failures, not successful deletion. An explicit manual deletion terminates pending reviews too.

## Schema and runtime access

The additive upgrade adds nullable `users.last_activity_at` and private `account_deletion_notices`. The notice stores identifiers, activity/deadline timestamps and delivery state; it does not duplicate contact destinations or provider payloads. One partial unique index permits one pending notice per member. Its optional notification FK uses `ON DELETE SET NULL` so existing notification cleanup remains valid.

Use `backend/migrate.py` only against an explicitly isolated development target to validate upgrades. For a live database, apply the reviewed minimal additive DDL before releasing the backend. Do not regenerate the applied initial Supabase SQL or run unrelated backfills on production. The table must have RLS, the existing backend runtime-group policy/CRUD grants, and revoked PUBLIC/browser access. See [runtime preparation](../supabase/operations/prepare_runtime_role.sql) and [feature access checks](../supabase/operations/check_account_inactivity_access.sql).

## Automatic checks

The bounded API job is `POST /api/internal/account-inactivity/check`. It authenticates a dedicated purpose-only random bearer key against a private digest in `library_settings`. It cannot authenticate users, access other API operations or delete accounts. Missing/wrong credentials fail closed. An authenticated `{ "dry_run": true }` request returns aggregate counts without creating notices, sending messages or changing activity.

The reviewed [scheduler setup](../supabase/operations/configure_account_inactivity_schedule.sql) prepares an hourly Supabase Cron job in an **inactive** state. It generates the key inside Vault and stores only its SHA-256 digest in application settings; neither value should be printed. Vault access is denied to browser/API-runtime roles and checked before setup completes. The job uses the [direct HTTPS client](https://supabase.com/docs/guides/database/extensions/http) instead of pg_net, so its credential is never stored in a shared request queue. No full Supabase service credential is used. Activate real processing only after the same Cron command succeeds with `{"dry_run":true}`.

The HTTP timeout is 60 seconds; connection timeout is 10 seconds. The backend bounds each job to at most three external attempts and never retries an uncertain claimed message. The Cron block raises an error for every response other than HTTP 200, so a successful completed run establishes HTTP success. Inspect Cron status/times without selecting message contents, request headers or patron data. A failed or timed-out run never means a notice was delivered.

Release order: additive schema/ACLs → backend → frontend → protected dry-run verification → scheduler activation. Do not claim automatic operation from repository config alone. No new email/SMS credentials or billing resources are provisioned by this feature.

## Verification limits

Use isolated synthetic accounts and mocked transports for lifecycle, ownership, role, deadline, duplicate-send and deletion tests. Browser fixtures must contain synthetic names/contacts only. A passing mock does not establish real provider/inbox delivery, complete historical activity, or PostgreSQL concurrency behavior. Report actual migration, deployment, scheduler and delivery evidence separately.

The staff queue uses 20 notices per page. Serialization still checks activity and outstanding loans per notice; large-cohort latency has not been measured on production. This is a performance follow-up, not a relaxation of the approval checks.

## November 22, 2026 release verification

Application commit `b07deea` passed both Vercel deployments. The isolated backend suite passed 501 tests with 32 skipped; all 109 frontend helper tests, lint, production build and built-asset credential scan passed. Synthetic Playwright checks passed against the worktree preview, restarted localhost app and deployed frontend at 1440px desktop and 390px mobile viewports, including dark/light views, member responses, notice send/reply/approval, manual override, loan guards, queue refresh/pagination and retries. API requests in browser checks were mocked; they did not use real patron records or send real messages.

The additive production schema, five valid notice indexes, notification FK behavior, runtime CRUD, RLS and browser denials were verified by metadata. Anonymous requests to both staff and internal-job routes returned 401. Supabase security advisors returned no findings. The direct-HTTPS Cron dry-run completed successfully at **8:28 AM Philippine time on November 22**, establishing HTTP 200 through the command's explicit status check. The job was then enabled at minute 17 each hour. The unused pg_net extension was removed with empty request/response tables before any credential was queued. Real provider/inbox/SMS delivery and live PostgreSQL contention were not tested.
