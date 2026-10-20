# Implementation status — October 20, 2026

This reconciles the numbered lists without treating code completion, staging
acceptance and production release as the same milestone. It is not a new
vulnerability scan. Source: [repair ledger](REPAIR_LEDGER.md), [security recheck](SECURITY_RECHECK_2026-10-18.md),
[Redis acceptance](REDIS_STAGING.md), [frontend cleanup](FRONTEND_CREDENTIAL_CLEANUP.md)
and [database-role rehearsal](RUNTIME_ROLE_REHEARSAL.md).

## Counts

- **12/12 confirmed defects fixed and tested locally; zero code fixes outstanding
  in that specific set.** Their coordinated production rollout remains one
  separate release workstream, including restored-database rehearsal/migration.
- **2/15 security follow-ups completed within their defined scope; 13 remain open.**
  Excluding the user's deferred PAD work gives **12 open non-PAD security items**.
  An open item can contain completed code or staging tests; this count does not
  mean 13 new vulnerabilities or 13 unstarted implementations.
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
| 5 | Restricted database account | Both 14/16-table local rehearsals and actual encrypted Supabase pooler/14-table permission checks passed. Cloud API workflow acceptance and live switch pending; candidate disabled between tests. |
| 6 | Frontend database/storage credentials | Completed frontend disconnect, variable removal and guarded build release. Historical credential retirement belongs to item 7. |
| 7 | Credential handling | API Sensitive conversion, consumer-aware rotation and old credential retirement pending. |
| 8 | Biometric consent | Product policy and implementation pending. |
| 9 | Biometric retention/deletion | Product policy and implementation pending. |
| 10 | Biometric encryption | Key-management/recovery design and implementation pending. |
| 11 | Staff security-alert workflow | Evidence/access/audit policy and workflow pending. |
| 12 | Administrator MFA | Enrollment/recovery/emergency-access design and implementation pending. |
| 13 | Setuptools exception | Approved moderate compatibility exception remains open; no new advisory scan in this update. |
| 14 | Broader CSP | Candidate implementation and browser acceptance pending. |
| 15 | OS image / optional face runtime | Full image scanning and optional InsightFace acceptance pending; neither is established by import tests. |

## Other known feature/release gaps

These are documented gaps, not a reconstruction of the unavailable original
17-item numbering or authorization to implement unspecified product policies:
email/SMS recovery delivery, real reminders, scheduled reservation expiry,
damage/loss management, private condition photos and durable offline synchronization.
Camera QR decoding and atomic multi-book circulation are also absent; they require
explicit product scope rather than being incidental fixes. See the architecture
and repair rollout documents for behavior and limitations.

## Current next step

Proceed with security item 5's cloud API workflow acceptance using deployed
baseline application code before changing the production connection. Real pooler
acceptance is complete: after the user corrected the URI username and supplied the
matching password privately in Supabase, the protected Preview connected as the
expected restricted login over TLS and passed every role/14-table verifier check.
The password and connection URI were never returned in tool output or chat.

The candidate URI remains a Preview-only Vercel Secret with no branch restriction.
The temporary Preview was removed and the candidate returned to NOLOGIN; enable it
only for the next controlled acceptance. The live API still uses its prior owner
connection. No patron rows, application startup/migration, or Storage operations
were exercised by the read-only checker. The cloud application/Storage acceptance,
reviewed production switch, owner-credential retirement and recovery gates remain.
This progress does not close item 5 or reduce the open-item count yet. See the
[rehearsal report](RUNTIME_ROLE_REHEARSAL.md) for exact evidence and limitations.

A fresh Vercel metadata-only check confirmed both public targets remain READY:
API `dpl_FpN6P2p7Aq8f1NMnc1ym8xQciM7E` at `8975023`, frontend
`dpl_Ewjj59uW2f1xc8zJw9pkgbj5va93` at `c18c05b`. API project Production still
has no `DATABASE_URL` override or shared-rate-limit URI; the frontend has zero
Production variables. Values were not fetched. This is deployment/configuration
metadata evidence, not a new database privilege or authenticated workflow check.
