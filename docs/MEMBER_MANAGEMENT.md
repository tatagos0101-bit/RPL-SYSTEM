# Member capture and deletion

Implemented locally on `fixing-the-issue`, October 21, 2026. Not deployed.
The user approved preserving completed history and blocking deletion while
books are outstanding. PAD remains excluded.

## Capture

The former librarian capture handler silently ignored a null webcam screenshot
and did not show camera permission failures. The replacement waits for a playable
preview, uses the camera frame dimensions, reports missing frames/errors, and
offers camera retry and retake. It submits only after **Enroll** and confirms
success only after the API succeeds. Recognition thresholds and PAD are unchanged.
Physical camera/recognition acceptance remains necessary; synthetic camera
checks establish browser behavior only.

**Registered Users → Actions → Register Face / Replace Face** uses the existing
librarian enrollment endpoint. A successful replacement removes prior templates,
including other recognition engines, before saving the new enrollment in the
same transaction. A failed detection/duplicate check leaves enrollment unchanged.

## Deletion policy

Both DELETE endpoints require an active, unrestricted librarian session, current
librarian password confirmation, and a rate limit. The UI additionally requires
typing `DELETE`. They target members only, not staff accounts.

- `DELETE /api/librarian/users/{id}/face`: removes the legacy encoding, every
  active/inactive embedding, and snapshots explicitly linked to this account.
  Revokes every existing session. The account, password, and history remain.
- `DELETE /api/librarian/users/{id}`: refuses outstanding or inconsistent
  unreturned loans. Cancels pending/ready reservations and promotes queues using
  the shared book-lock policy. Removes face data, sessions, recovery codes,
  preferences/goals, linked notifications, and the referenced ID/avatar files.
  Clears name, contact details, old member ID and verification flags.
- Completed transactions, copy identities, dates, totals and attendance rows
  remain. Attendance notes are cleared. An identity-free `users` row named
  `Deleted member` retains the internal foreign key, is permanently suspended,
  and has no usable password. It is excluded from member management/counts and
  cannot be reset, reactivated or re-enrolled. This is deidentification, not a
  guarantee against linking historical activity with other datasets.
- Linked security alerts lose their snapshots, IP address and user association
  on account deletion. Unattributed snapshots cannot safely be assigned to a
  member and are outside this action. No retention period is introduced.
- Legacy staff notices linked only by name are removed only when that name
  identifies one current account. Ambiguous ownership, shared private files or
  unsupported legacy upload references block deletion for review.

Current identity writes revalidate their session after obtaining the member lock.
Face matches recheck the current enrollment after locking before authentication
or automatic engine upgrade, so an in-flight match cannot recreate removed data.
Deduplication checks do not auto-upgrade another account.

Storage operations use the existing server-side Storage API, not SQL deletes
against Storage metadata ([Supabase deletion guidance](https://supabase.com/docs/guides/storage/management/delete-objects)).
Storage and SQL do not share a transaction: a failure can remove one file before
the SQL operation rolls back. The API reports failure and retains the references
for retry; it does not claim completed deletion. Repeating a completed account
deletion is harmless. Previously downloaded files, backups, unreferenced uploads,
and operational logs are not erased by this endpoint.

## Release and verification

1. Apply the existing additive migration runner with privileged migration
   credentials **before** deploying this API. It adds nullable
   `users.deleted_at`; existing users retain NULL. Keep `AUTO_MIGRATE=false`.
   Do not regenerate initial SQL or point a development server at production.
2. Verify repeat migration, foreign keys, concurrent deletion versus circulation,
   and role permissions on disposable PostgreSQL. Local SQLite tests are not
   evidence of PostgreSQL row locking.
3. Verify private-file removal against disposable Storage objects. Then deploy
   backend before frontend and exercise synthetic accounts.

Regression coverage is in `test_member_deletion.py`, the existing authentication,
face-engine and cloud integration suites. Browser QA uses the built frontend
at `127.0.0.1:4178`, Edge/Playwright, desktop 1365×900 and mobile 390×844,
with synthetic API responses and a canvas camera. The Browser plugin is not
available. Capture/retake/enroll, null-frame feedback, denied-camera recovery,
password/confirmation requirements, face deletion, account deletion and
outstanding-loan blocking pass without page runtime errors.

Verification completed October 21: 213 backend tests passed; four optional
external-service tests were skipped. The dedicated disposable PostgreSQL/Redis
runner separately passed repeat migrations, runtime permissions, session checks,
concurrent circulation and competing account deletion/borrow operations. All 64
frontend helper tests, lint, production build and credential scan passed.
Subsequent October 21 rollout verified live private-avatar deletion with a
generated image and synthetic account, plus cloud session/circulation/deletion
workflows. An encrypted application-database backup was restored and migrated
twice before the live upgrade. Both projects were deployed from merged main.
Physical-camera acceptance remains pending. See the
[release record and backup scope](REPAIR_RELEASE_2026-10-21.md).

## Portal session synchronization

Both portals still share one active cookie per browser profile. Protected screens
revalidate on another tab's auth-storage changes, window focus and visibility.
Old profile requests are cancelled; protected layouts unmount during revalidation
and are keyed by account identity. Browser QA verified an existing librarian tab
switches to the member portal after a second-tab login without refresh, and both
tabs leave protected pages after logout. Password and face login accept an optional
expected portal role; the server rejects a mismatch before changing the cookie.
Two backend tests verify wrong-portal logins preserve the current session.
