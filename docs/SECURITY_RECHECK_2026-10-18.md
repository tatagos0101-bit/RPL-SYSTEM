# Production security recheck — October 18, 2026

For reconciled completion counts and the latest next step, see
[implementation status](IMPLEMENTATION_STATUS.md). The tables below retain this
audit's original date rather than silently presenting old observations as current.

Subsequent [frontend credential cleanup](FRONTEND_CREDENTIAL_CLEANUP.md) completed
October 19: all 16 frontend Supabase/PostgreSQL variables and that resource
connection were removed, and a guarded frontend build was released. API deployment
and configuration metadata were preserved. Items 6/7 below record the earlier
audit; backend Sensitive conversion/provider rotation remains pending.
The later [runtime-role audit/rehearsal](RUNTIME_ROLE_REHEARSAL.md) also confirmed
item 5's live privilege state: the backend is an owner/admin-capable login, with
RLS bypass. The group was absent at that audit; a later October 19 operation created
the restricted group, baseline grants/policies and disabled candidate account.
Browser table denial remains intact. Local rehearsal and live catalog checks passed;
credential handoff, actual candidate pooler login and live cutover remain pending.

Subsequent authorized preview testing is recorded in [REDIS_STAGING.md](REDIS_STAGING.md).
It verifies the direct preview client-address boundary and managed Redis staging;
production activation and actual frontend/kiosk acceptance remain pending. The table below records the
earlier read-only audit, before those preview tests.

Read-only review following the thread's 15 security/infrastructure follow-ups.
These are distinct from the 17 feature/policy/release follow-ups and the 12 repaired
defects. No production settings, credentials, records, migrations or deployments
were changed. PAD remains excluded. No secret values or patron data were inspected.

## Verified live

- GitHub `main` is `897502349ae16f52209bc2d533566d2e08d3f2d1`.
  Both Vercel production targets report READY on that SHA. The 12 repairs at
  `effc45f` are local branch work, not live functionality.
- GitHub's paginated open Dependabot API returns **3 medium alerts, zero high or
  critical**: numbers 341, 236 and 62. All concern setuptools
  `GHSA-h35f-9h28-mq5c`, across requirements.txt, uv.lock and pyproject.toml.
- Frontend `/` and both origins' `/health` return 200. API
  `/api/user/profile`, `/api/librarian/users` and `/api/librarian/stats` return
  401 without authentication. `/openapi.json` returns 404. These checks establish
  anonymous rejection only, not wrong-role, owner or session-revocation behavior.
- HSTS and nosniff headers are present; API responses have `Cache-Control: no-store`.
  Frontend CSP is `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`.
- Project environment metadata lists no `RATE_LIMIT_STORAGE_URI`,
  `RATE_LIMIT_REQUIRE_SHARED` or `DATABASE_URL` on the backend. Project metadata
  alone does not rule out deployment-specific or inherited configuration.
- Frontend project metadata still lists POSTGRES connection/password variables,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_JWT_SECRET`.
  They have type `encrypted`, not `sensitive`. The backend's JWT secret, librarian
  authentication code and station PIN have type `sensitive`; its database/storage
  variables have type `encrypted`. Values were neither decrypted nor recorded.
  The metadata's absent configuration IDs do not prove integration ownership.

## Status of the 15 follow-ups

| # | Follow-up | Current evidence and next action |
| --- | --- | --- |
| 1 | Physical PAD acceptance | Still pending; excluded from this task. No camera/security certification claimed. |
| 2 | Face capture/replay limits | No new acceptance evidence. Requires explicit threat model and supervised alternatives; leave pending PAD work untouched. |
| 3 | Shared rate limiting | Not verified active. Project has no Redis variables; deployed limiter source defaults to process-local memory when URI is absent. Prepare managed Redis cutover only after item 4. |
| 4 | Trusted client address | Unverified on live Vercel adapter. Source hashes ASGI peer address, not arbitrary forwarded headers. Validate two controlled client networks and header-spoof resistance before shared counters. |
| 5 | Restricted database runtime role | Live grants/identity not inspected. No DATABASE_URL override in project metadata; source can use POSTGRES_URL. Variable names cannot establish database privileges. Use metadata-only database verification and the existing staged role cutover. |
| 6 | Frontend database/storage credentials | Presence confirmed. Frontend source consumes VITE_API_URL and DEV; build secret scanner also reads build environment. Identify external/build consumers before removing unnecessary frontend secrets. Backend storage credentials must remain functional. |
| 7 | Readable credential handling | Database/storage variables remain encrypted rather than sensitive. This is configuration exposure to authorized project readers, not evidence of public leakage. Plan consumer-aware conversion/rotation separately. |
| 8 | Biometric consent | No implemented consent workflow identified in reviewed source; product policy required. |
| 9 | Biometric retention/deletion | No complete policy/workflow identified. Do not invent retention periods or delete historical records. |
| 10 | Application biometric encryption | Existing JSON embeddings and raw base64 alert snapshot fields remain. No application encryption established; requires key-management/recovery design. |
| 11 | Staff security-alert workflow | Model includes is_read; no complete review/resolution workflow found in reviewed routes/UI. Define access, audit and evidence policy before implementation. |
| 12 | Administrator MFA | No MFA implementation identified. Enrollment, recovery and emergency access decisions remain necessary. |
| 13 | Setuptools exception | Three current alerts represent one moderate advisory. Approved exception remains visible; no compatibility upgrade attempted. |
| 14 | Broader CSP | Limited policy confirmed live. Script/connect/image restrictions remain a candidate for staged testing with camera, private images and API traffic. |
| 15 | OS image / optional runtime | No fresh full image scan or optional InsightFace acceptance performed. Previous import/synthetic inference checks are not vulnerability or camera certification. |

## Dependency advisory qualification

The [maintainer advisory](https://github.com/pypa/setuptools/security/advisories/GHSA-h35f-9h28-mq5c)
describes Unicode filename exclusions failing during source-distribution creation,
particularly on macOS. It currently lists affected versions through 82.0.1 and
"Patched versions: None". Therefore this recheck does not independently endorse the
older rollout document's claim that version 83 fixes it. Confirm current package
advisory metadata and model-package compatibility before choosing a replacement.
This is not evidence of a remotely exploitable application endpoint. The approved
80.10.2 compatibility pin remains unchanged. No new full npm/OSV/container scan was
run; the current alert count comes directly from GitHub.

## Recommended sequence

1. Verify Vercel client-address behavior with controlled requests and narrowly scoped
   observation that avoids patron logs. Then prepare Redis TLS/ACL configuration,
   multi-instance counter tests, outage rejection and a documented rollback. Do not
   enable mandatory shared limiting until the store is ready: it can reject logins.
2. Prepare frontend credential removal with a consumer inventory and candidate build;
   stage sensitive-variable conversion/rotation with backend continuity checks.
3. Verify the database runtime identity/grants using metadata only, then rehearse the
   restricted-role cutover. Coordinate table grants with the separate repair release.
4. Stage broader CSP and image scanning; handle biometric and MFA policy decisions
   explicitly. The 12-repair rollout remains subject to its database rehearsal in
   [REPAIR_ROLLOUT.md](REPAIR_ROLLOUT.md).

The read-only recheck is complete, but these infrastructure controls are not certified
as enabled. No authenticated production mutation tests, multi-egress IP tests, live
database privilege queries or credential-value scans were performed. Application
suites were not rerun for this documentation-only change. Earlier guessed paths
`/api/auth/me`, `/api/users/me` and `/api/librarian/members` returned 404 and were
excluded from the access-control evidence above.
