# Inactive member account review

## Policy

After **six calendar months without recorded activity**, the system can send a friendly notice with **72 hours to respond**. The scheduled check creates notices only. It never deletes a member account. After the response deadline, a librarian must review and approve deletion with their password. The librarian also retains an explicit **Delete account now** action with the existing password/DELETE confirmation and outstanding-book safeguards.

An account with outstanding books cannot be deleted or placed into the inactive-account notice flow. Returning books, new recorded activity, or a member/librarian-recorded response cancels a pending review. Responding does not lift suspension, verify contact ownership, change a password, or erase library history.

## What counts as recorded activity

The latest of account creation, successful sign-in tracking, granted linked library encounters (including exit updates), borrowing/return dates, reservation creation and any retained session creation is used. Anonymous visits are not matched to an account by name. Philippine-time normalization is applied to UTC-aware and legacy timezone-less dates. Calendar-month calculation clamps month ends; it does not substitute 180 days.

Historical sign-in records are incomplete: expired sessions are cleaned and logout/reset removes sessions. The new persistent activity timestamp records future sign-ins and successful linked station encounters. Notices therefore say **last recorded activity**, rather than claiming a complete history of every past visit/sign-in.

## Delivery and replies

Every notice has a durable member-only notification in the account. External delivery attempts email when an address is present, otherwise SMS when a phone is present and the existing Twilio configuration is enabled. Without an available external transport, the notice remains available in the account. Contact verification flags are not changed by sending a notice.

- **Accepted** means the configured provider accepted the send, not that the inbox received/read it.
- **Unavailable/failed** means external delivery was not confirmed; the in-app notice is still present.
- **Pending/unknown** means sending has not completed or its outcome could not be established. A claimed uncertain send is never automatically repeated.

The 72-hour window begins when the in-app notice is durably created. Members can sign in, use **Keep my account**, or contact the librarian. Staff can record an email/phone/in-person reply. The system does not read incoming email/SMS automatically. An old/repeated response is idempotent and cannot renew activity forever or cancel a newer review.

## Deletion approval and manual deletion

The approval endpoint locks member then notice, refreshes current state and rechecks the original activity snapshot, response deadline and outstanding books. Fresh activity or a prior response prevents approval. The existing deletion service removes personal details/private uploads/face data, revokes sessions and cancels reservations while retaining deidentified historical foreign keys. Storage failures are reported as failures, not successful deletion. An explicit manual deletion terminates pending reviews too.

## Schema and runtime access

The additive upgrade adds nullable `users.last_activity_at` and private `account_deletion_notices`. The notice stores identifiers, activity/deadline timestamps and delivery state; it does not duplicate contact destinations or provider payloads. One partial unique index permits one pending notice per member. Its optional notification FK uses `ON DELETE SET NULL` so existing notification cleanup remains valid.

Use `backend/migrate.py` only against an explicitly isolated development target to validate upgrades. For a live database, apply the reviewed minimal additive DDL before releasing the backend. Do not regenerate the applied initial Supabase SQL or run unrelated backfills on production. The table must have RLS, the existing backend runtime-group policy/CRUD grants, and revoked PUBLIC/browser access. See [runtime preparation](../supabase/operations/prepare_runtime_role.sql) and [feature access checks](../supabase/operations/check_account_inactivity_access.sql).

## Automatic checks

The bounded API job is `POST /api/internal/account-inactivity/check`. It authenticates a dedicated purpose-only random bearer key against a private digest in `library_settings`. It cannot authenticate users, access other API operations or delete accounts. Missing/wrong credentials fail closed. An authenticated `{ "dry_run": true }` request returns aggregate counts without creating notices, sending messages or changing activity.

The reviewed [scheduler setup](../supabase/operations/configure_account_inactivity_schedule.sql) prepares an hourly Supabase Cron/pg_net job in an **inactive** state. It generates the key inside Vault and stores only its SHA-256 digest in application settings; neither value should be printed. It restricts browser/API-runtime access to Vault/pg_net queue objects. No full Supabase service credential is used. This follows the [Supabase scheduling pattern](https://supabase.com/docs/guides/functions/schedule-functions), with a dedicated narrow credential because pg_net transiently holds HTTP headers. Activate the job only after its authenticated dry-run returns HTTP 200 without timeout.

Set an explicit HTTP timeout suitable for the backend's 60-second function limit. The backend bounds each job to at most three external attempts and never retries an uncertain claimed message. Cron's successful SQL run/queued request ID is not proof that the HTTP job worked; verify the response's HTTP status and timeout flags separately, without selecting request headers, message contents or patron data.

Release order: additive schema/ACLs → backend → frontend → protected dry-run verification → scheduler activation. Do not claim automatic operation from repository config alone. No new email/SMS credentials or billing resources are provisioned by this feature.

## Verification limits

Use isolated synthetic accounts and mocked transports for lifecycle, ownership, role, deadline, duplicate-send and deletion tests. Browser fixtures must contain synthetic names/contacts only. A passing mock does not establish real provider/inbox delivery, complete historical activity, or PostgreSQL concurrency behavior. Report actual migration, deployment, scheduler and delivery evidence separately.

The staff queue uses 20 notices per page. Serialization still checks activity and outstanding loans per notice; large-cohort latency has not been measured on production. This is a performance follow-up, not a relaxation of the approval checks.
