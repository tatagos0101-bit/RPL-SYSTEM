# Implementation status — October 25, 2026

This reconciles the numbered lists without treating code completion, staging
acceptance and production release as the same milestone. It is not a new
vulnerability scan. Source: [repair ledger](REPAIR_LEDGER.md), [security recheck](SECURITY_RECHECK_2026-10-18.md),
[Redis acceptance](REDIS_STAGING.md), [frontend cleanup](FRONTEND_CREDENTIAL_CLEANUP.md)
and [database-role rehearsal](RUNTIME_ROLE_REHEARSAL.md).

## Counts

- **12/12 confirmed defects fixed, tested and deployed; zero fixes outstanding
  in that specific set.** The October 21 release completed the restored-database
  rehearsal, migration, main merge and production rollout; see
  [release evidence](REPAIR_RELEASE_2026-10-21.md).
- **4/15 security follow-ups completed within their defined scope; 11 remain open.**
  Excluding the user's deferred PAD work gives **10 open non-PAD security items**.
  An open item can contain completed code or staging tests; this count does not
  mean 11 new vulnerabilities or 11 unstarted implementations.
- The historical reference to **17 feature/policy/release follow-ups** does not
  contain the complete numbered list in the available repository records. Do not
  add 17 to the counts above: there are overlapping security/policy/release topics.
  A definitive total for that original list requires its actual thread checklist.

## Security follow-ups, preserving the original numbers

| # | Item | Status / remaining action |
| --- | --- | --- |
| 1 | Physical PAD acceptance | Deferred by user; untouched. |
| 2 | Face capture/replay limits | Open; agree threat model and acceptance scope. |
| 3 | Shared rate limiting | Code/staging/two-station pacing tested; production service/workload acceptance and activation pending. |
| 4 | Trusted client address | Completed scoped validation: two network sources, spoof resistance and actual-project rewrite routing; no change to trusting arbitrary headers. |
| 5 | Restricted database account | Completed scoped rollout: restricted runtime active, old owner variables removed, operator-confirmed provider password reset, post-reset cloud/API/Storage checks passed. Integration can recreate owner variables on future resets; recheck before deployment. |
| 6 | Frontend database/storage credentials | Completed frontend disconnect, variable removal and guarded build release. Historical credential retirement belongs to item 7. |
| 7 | Credential handling | API Sensitive conversion, consumer-aware rotation and old credential retirement pending. |
| 8 | Biometric consent | Product policy and implementation pending. |
| 9 | Biometric retention/deletion | Approved librarian-triggered member/face deletion deployed and cloud-tested; retention schedules and broader evidence policy remain pending. |
| 10 | Biometric encryption | Key-management/recovery design and implementation pending. |
| 11 | Staff security-alert workflow | Evidence/access/audit policy and workflow pending. |
| 12 | Administrator MFA | Enrollment/recovery/emergency-access design and implementation pending. |
| 13 | Setuptools exception | Approved moderate compatibility exception remains open; no new advisory scan in this update. |
| 14 | Broader CSP | Completed scoped implementation and release: configuration tests, browser compatibility/negative probes and actual edge headers passed. Inline-style and image-source exceptions are documented in [CSP acceptance](BROWSER_CSP.md). |
| 15 | OS image / optional face runtime | Full image scanning and optional InsightFace acceptance pending; neither is established by import tests. |

## Other known feature/release gaps

These are documented gaps, not a reconstruction of the unavailable original
17-item numbering or authorization to implement unspecified product policies:
email/SMS recovery delivery, real reminders, scheduled reservation expiry,
damage/loss management, private condition photos and durable offline synchronization.
Camera QR decoding and atomic multi-book circulation are also absent; they require
explicit product scope rather than being incidental fixes. See the architecture
and repair rollout documents for behavior and limitations.

## Restricted runtime and owner-password retirement completed

October 25: the operator saved a Production-only Sensitive `DATABASE_URL` privately.
Guarded enablement and the protected full-API candidate passed actual restricted
pooler identity/TLS and all 16-table checks, synthetic login/access/circulation/
reservation workflows, and real Storage upload/signing/privacy/cleanup checks.
Synthetic database rows were rolled back, generated objects deleted, and the
diagnostic deployment removed. The local operational suite passed 76 tests, plus
disposable PostgreSQL success and injected-permission-failure rollback checks.

Clean API deployment `dpl_5m5XgzvhJfnf6NoHZDctWp7HXCHM` is live, using unchanged
main application source `03525120ad49e862ec84dfc70fc518fa34d0333f`. API and website
rewrite health/access smoke checks passed. Frontend deployment
`dpl_HUYUMetQZr5tYVRiJ4CtqMqjZzbN`, PAD and Redis were unchanged. The runtime login
remains enabled; automatic migrations remain disabled. Preview credentials were
preserved and no credential values were returned.

A subsequent [owner-credential cleanup](OWNER_CREDENTIAL_RETIREMENT.md) removed all
seven `POSTGRES_*` variables and promoted clean API `dpl_3NwB7oo7JWNqLs9tW6UQ5yzETckn`
on the same main revision. Protected cloud API/Storage acceptance and both public
health/access paths passed again; the frontend is unchanged. The operator then
confirmed resetting the old owner password privately. Integration-recreated owner
variables were removed again and post-reset cloud/API/Storage checks passed. The local
backup helper now requests separate maintenance credentials rather than reading an
old Vercel export. Item 5 is complete within that scope; broader API-key/credential
handling remains item 7. Provider-reset completion is operator-confirmed, not an
independent old-password rejection test. Check for integration reinjection after
future resets/syncs. No application source change was needed for those operational
releases. The completed test tools and records are included in the
[October 25 repository handoff](COMPLETED_WORK_HANDOFF_2026-10-25.md).

## October 21 release request

The user authorized committing completed implementations and merging/deploying
only after release safety checks. Member capture/deletion and cross-tab portal
synchronization are documented in [MEMBER_MANAGEMENT](MEMBER_MANAGEMENT.md).
A read-only production preflight returned zero normalized-email collisions,
duplicate active reservations and overcommitted ready-hold titles. Local tests
and disposable PostgreSQL checks pass. The initial missing-backup gate was resolved
with an encrypted local application-database backup and restored migration
rehearsal, including a fresh maintenance-window backup. Live migration, PR #1 merge
and both deployments completed. See [release evidence and backup limitations](REPAIR_RELEASE_2026-10-21.md).
At that October 21 release, PAD, Redis activation, restricted-runtime cutover and
other pending implementations remained unchanged. The October 25 runtime update
above supersedes that historical cutover status.
