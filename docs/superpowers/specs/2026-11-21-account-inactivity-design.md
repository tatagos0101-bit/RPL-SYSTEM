# Six-month inactive-member notices

## Approved behavior

The user approved automatic inactivity notices after **six calendar months**, a **72-hour** response window, and **librarian approval before deletion**. The librarian retains an explicit immediate manual-deletion option with the current password confirmation and outstanding-loan safeguards. Renewed activity or a member/staff-recorded reply keeps the account and cancels the pending review. No scheduler may delete an account.

## Approach

Reuse the FastAPI authorization, attendance/circulation history, notification inbox, SMTP delivery, optional Twilio transport and existing deidentifying deletion service. Persist notice state in a private SQLAlchemy model, with an index preventing two pending notices for one member. Pure frontend timers or in-process background loops do not survive serverless instances; use a purpose-authenticated periodic HTTP job called by Supabase Cron. No Supabase Auth or browser table access is introduced.

## Activity and notices

- Latest recorded activity is the greatest of member creation, a persistent new `users.last_activity_at`, granted linked entry-log time-in, transaction borrow/return dates, reservation creation, and any existing session creation. Ignore guest/name-only visits and denied scans. Normalize through `as_ph`; six months means a calendar-month subtraction with month-end clamping, not 180 days.
- A legacy account without any dated activity has an unknown date and is ineligible for automatic notices; review returns null activity/day values instead of fabricating a date or failing. A null creation date does not discard valid dated history.
- Persist future successful sign-ins and successful linked station encounters (including exits/time-out updates) in `last_activity_at`, in the caller's existing transaction. Member Keep/staff-recorded replies update it only on their first valid response so an old repeated request cannot renew activity indefinitely. Do not change contact verification, suspension or password state.
- Exclude deleted/non-member accounts and accounts with outstanding books from new notices. Last recorded activity and missing historical login coverage must be described honestly; do not fabricate an old visit date.
- Create one member-targeted in-app notification for every notice. Prefer email when present; otherwise phone SMS using the existing optional Twilio configuration; if unavailable/failed/no contact, keep the confirmed in-app notice and truthfully show the transport outcome. No production patrons/messages are used in tests.
- Friendly text: “Hello {first_name}, we hope you’re doing well! It has been {days} days since your last recorded library activity. We’d love to welcome you back. Please sign in, choose Keep my account, or contact the library by {deadline in Philippine time} if you’d like to keep your membership. If we don’t hear from you, your account will be sent to the librarian for deletion review.”
- Store IDs/times/delivery outcome, not duplicate contact destinations or message-provider response bodies. Notice `notification_id` is a nullable FK with ON DELETE SET NULL; manual deletion also terminates pending notice rows. Commit durable creation and a one-shot transport claim before SMTP/Twilio. Store pending/unknown outcomes; never repeat a claimed uncertain send after a crash. Provider acceptance is not proof of inbox delivery.

## Staff and member flow

- Users > Delete Account opens account activity/notice review first. An explicit Delete account now option opens the existing irreversible password/DELETE confirmation. This bypasses notice timing only, never outstanding books or deletion safety checks.
- An inactive eligible account can receive a notice from the periodic check or a supervised Send three-day notice action. Pending cards show reply deadline and delivery outcome. After 72 hours without renewed activity, show Ready for librarian approval.
- A librarian can record a member reply or approve a mature notice with password confirmation. Approval rechecks latest activity, exact notice identity and outstanding loans under member locks before calling the existing deletion helper. A replied/stale notice cannot delete an account.
- Members can see the notice and choose Keep my account. Member routes are owner-scoped and role-checked. Clicking an email opens the account notification page/login; an email link itself never proves identity or changes state.
- Existing manual account deletion remains callable with the existing request contract; outstanding books, private-upload validation, historical foreign keys, deidentification, reservation cancellation and session revocation remain authoritative.

## Interface contract

All timestamps are timezone-aware ISO values; client rendering uses Philippine time. `NoticeView` fields: `id` (UUID string), `user_id`, `member_name`, `member_id`, `last_activity_at`, `inactive_days`, `created_at`, `respond_by`, `status` (`waiting`, `ready_for_review`, `cancelled`, `deleted`), `delivery_channel` (`email`, `sms`, `in_app`), `delivery_status` (`pending`, `unknown`, `accepted`, `unavailable`, `failed`, `in_app`), `notification_id`, `message`, `has_outstanding_loans`. No credentials/digests/destinations are returned.

- `GET /api/librarian/account-notices?status=pending|ready_for_review|cancelled|deleted|all&skip=0&limit=20` => `{items,total,inactivity_months:6,response_hours:72}`.
- `GET /api/librarian/member/{user_id}/account-notice` => `{notice: NoticeView|null,last_activity_at,inactive_days,eligible,has_outstanding_loans,inactivity_months:6,response_hours:72}`.
- `POST /api/librarian/member/{user_id}/account-notice` body `{current_password}` => NoticeView; idempotently returns an existing pending notice.
- `POST /api/librarian/account-notices/check` body `{}` => aggregate counts, no patron records; bounded check/send batch.
- `POST /api/librarian/account-notices/{notice_id}/record-reply` body `{}` => updated NoticeView.
- `POST /api/librarian/account-notices/{notice_id}/approve` body `{current_password}` => `{status:'deleted'}`; premature/stale notice => 409.
- `GET /api/user/account-notice` => `{notice: NoticeView|null}` (latest owner notice).
- `POST /api/user/account-notices/{notice_id}/keep` body `{}` => updated NoticeView; repeat response is idempotent.
- `POST /api/internal/account-inactivity/check` authenticates only a dedicated random job key whose SHA-256 digest is held in private `library_settings` key `account_inactivity_job_digest`. Empty/missing/wrong/oversized credentials fail closed. This route can only process notices, never delete accounts.

Inbox notification type is `account_inactivity`. Detail can fetch the current owner's notice and render the action only when its `notification_id` matches the opened message. No new notification-table column is necessary. The account review UI uses the endpoint rather than inferring identifiers from message text.

## Scheduling and deployment

All lifecycle writes use member → notice lock order and refresh after waiting. Approval compares current recorded activity with the original activity snapshot, not only notice creation time. An old response cannot cancel a newer notice. Deletion closes notices in the same SQL transaction as existing deletion effects.

Supabase Cron plus pg_net calls the own API hourly in a bounded batch (maximum three external transport attempts per call, one attempt each). Set an explicit 60-second network timeout and an application execution budget under that. A random 256-bit job key is generated inside PostgreSQL, stored in Vault, and its digest stored in `library_settings`; do not print/copy the key. Cron SQL stores only the Vault secret name. Restrict newly enabled pg_net queue/response and network-function access from PUBLIC/browser/API-runtime roles; never use a Supabase service key as the job credential. No new public SQL functions or browser grants. Cron's queued request ID alone is not proof of HTTP success; inspect only response status/timeout metadata.

Apply additive schema before the compatible backend, then frontend, then enable the schedule after deployed authorization checks. Grant the new private table only to the existing API runtime role(s), preserving their backend RLS policy convention and updating preparation/audit allowlists. Verify schema/index/FK/RLS/ACL metadata and advisors. Validate migration repeatability and existing rows locally; do not claim SQLite proves PostgreSQL behavior. Do not run the general production migrate.py script or regenerate the applied initial schema.

## Acceptance

Test calendar boundaries/leap dates, history signals and missing history, no duplicate notices, provider unavailable/failure, recipient-safe logs, 72-hour boundaries, owner/wrong-role/suspended access, renewed-activity races, no scheduler deletion, password-confirmed manual override, outstanding books, storage failures, repeated migration, and retained history. Verify Users review, member Keep action, notification navigation and desktop/phone layout with synthetic records. Real email/SMS delivery requires independent provider confirmation; do not claim it from mocks.
