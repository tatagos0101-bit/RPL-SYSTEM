# Authentication and infrastructure security rollout

Subsequent [frontend credential cleanup](FRONTEND_CREDENTIAL_CLEANUP.md) was
completed October 19: the frontend Supabase connection was removed and its build
guard released. The API connection/deployment was preserved. The dated release
records below describe the earlier baseline; shared Redis production activation
and runtime-role/credential-rotation cutovers remain separate.

Source preparation is not a live deployment. The October 17 release below records
the applied session migration and deployed source. Credentials, Vercel integration
settings, database runtime roles, and Redis provisioning remain unchanged.
Use isolated PostgreSQL and Redis first; SQLite/mocked tests do not validate live
pooler behavior, PostgreSQL locking/policies, or multi-instance Redis counters.

## October 17 production release

With user authorization, `main` was fast-forwarded to security commit `9e0a9d9`.
The `rpl-system` and `rpl-system-api` Vercel production targets both reached READY
on that commit. Pending PAD work remains in the original `photo-spoofing` worktree
and was neither merged nor deployed.

- Applied only `20261016000100_auth_sessions.sql` before releasing the API.
  Verified the session columns, RLS, browser-role denial, and runtime grants;
  existing recommendation tables/indexes were already present. No global backfills
  or existing patron/loan record changes were performed. `AUTO_MIGRATE=false` remains.
- Built production candidates without switching the live domains, then checked
  API health and real session behavior using a temporary synthetic member. Login,
  Secure/HttpOnly/SameSite cookies, required password change, old-token revocation,
  replacement cookies, and logout passed. Removed the synthetic account/sessions.
- After the main push, both public origins passed health (database, Supabase storage,
  dlib), anonymous-access rejection, and validation-input disclosure checks.
  The frontend build credential scanner passed; a separate check of 59 live public
  assets found no matches for the available production credential values/signatures.
- Live Edge browser checks passed at 390x900 and 1440x900: synthetic member login,
  required password change, reload persistence, profile/reservations, and sign-out
  after its API request completed. Secure/HttpOnly cookies were present at login
  and cleared at logout, with no browser errors or failed requests. Screenshots
  were inspected, and the temporary synthetic member and sessions were removed.
- GitHub's completed dependency rescan reduced **333 open alerts to 3 moderate
  alerts**, with **zero critical, high, or low alerts**. All three remaining alerts
  are `GHSA-h35f-9h28-mq5c` for setuptools, duplicated across requirements, pyproject,
  and uv.lock; this is the explicitly approved compatibility exception below.

Existing stateless sessions require a new login after this release. The JWT secret
and managed station PIN were not rotated. Shared Redis rate limits and a restricted
runtime-role cutover remain prepared follow-up infrastructure work; this release
does not claim those controls are enabled. Physical-camera/PAD acceptance and the
optional InsightFace runtime remain outside this release.

## October 17 integration with current main

The remediation worktree combines the existing security hardening with the current
interface and personalized recommendations. Pending PAD source, models, thresholds,
and UI changes remain exclusively in the original `photo-spoofing` working tree.

- Replaced python-jose with `PyJWT[crypto]==2.15.1` in both application manifests,
  regenerated `uv.lock`, and matched the integration harness. This removes
  python-jose and its ecdsa dependency. Session and upload tickets require `exp`
  and `sub`, restrict algorithms explicitly, and preserve the HMAC wire format.
  Startup allows only HS256/HS384/HS512 for the shared-secret architecture.
- Existing server-side session, logout, password-change/reset, owner/category,
  cookie and bearer checks remain. Pre-session-upgrade tokens still require a
  new login. No JWT secret or station PIN rotation is needed for the library change.
- Borrow/return requests hold member then book locks through their final commit.
  Their policy/copy helpers do not commit independently. PostgreSQL tests force
  overlapping requests and verify duplicate-copy/member rejection, independent
  loans, one stock increment per return, and preserved loan history. No loan rows
  are deleted or rewritten by a migration; no unique-index backfill is introduced.
- Runtime-role scripts and the isolated integration harness include all 14 tables,
  including private `book_interactions`. Both session and recommendation models
  remain registered. Keep the existing recommendation migration/index requirements.
- Docker's recognition-package versions are pinned to the existing uv versions;
  recognition code and model assets are unchanged.
- Member and librarian layouts defer notifications/fines while a required password
  change is in progress, then resume requests after completion. This preserves the
  existing screens without requests forbidden by the restricted-session policy.

Fresh npm and OSV scans on October 17 found zero frontend advisories and one
distinct backend advisory: setuptools 80.10.2, `GHSA-h35f-9h28-mq5c` (moderate).
Its GHSA and PYSEC records describe the same issue. This affects source-distribution
exclusion rules on macOS. The application does not publish an sdist, and upgrading
to setuptools 83 removes `pkg_resources`, required by `face_recognition_models`.
The compatibility pin remains visible and unsuppressed. Do not publish source
distributions with this runtime environment; use isolated patched build tooling.
Removing this final dependency finding needs a separately verified model-package
compatibility change. These scans do not certify the OS image or optional InsightFace.

Verification of this integrated worktree on October 17:

- Backend: 164 passed, one skipped. The skip is the opt-in PostgreSQL recommendation
  performance test; SQLite/mocked tests do not establish its performance results.
- Frontend: 56 helper/scanner tests passed; lint, production build, and the build
  credential check passed. Eight integration-runner guard tests passed.
- Disposable PostgreSQL 17/Redis 8 checks passed, including repeated schema/runtime
  role setup, existing-record preservation, all 14 table access checks, sessions,
  shared rate limits, and forced concurrent borrow/return requests. Cleanup succeeded.
- Headless Edge browser checks passed against an isolated synthetic SQLite backend:
  member/staff login, reload persistence, HttpOnly cookies, no browser-stored token,
  mobile required-password changes for both roles, and staff logout/cookie clearing.
  Catalogue, reservations, profile, inventory, circulation, reports, users, add-book,
  and settings screens loaded without failed requests or browser errors. Desktop
  1440x900 and mobile 390x900 screenshots were inspected. Screen loading is not a
  test of every operation. Existing Playwright was used because the Browser plugin
  was unavailable; no real patron data or production credentials were used.
- The full Python 3.11 application Docker image built successfully. A network-disabled,
  read-only container passed API import, isolated schema initialization, JWT round
  trip, and dlib inference on a synthetic blank frame. The existing dlib-bin package
  provides the working dlib import but does not satisfy face-recognition's `dlib`
  distribution metadata, so pip reports that known metadata mismatch. The retained
  model package also emits a pkg_resources deprecation warning.
- Physical-camera/PAD acceptance, optional InsightFace, live cloud policies,
  production configuration, and OS-image vulnerability scanning were not performed.

Release prerequisites: apply the additive auth-session SQL before deploying the API,
confirm the existing recommendation schema, and validate actual cloud settings.
The runtime-role and Redis cutovers remain separately planned infrastructure changes.
Pushing main can deploy automatically; a local commit does not apply the database
migration, update production, or close GitHub alerts. PAD acceptance remains pending.

## Disposable local integration environment

With Docker Desktop running Linux containers and Compose available, run from the
repository root:

```powershell
python scripts/run_security_integration.py
```

The runner creates a uniquely named local Compose project with PostgreSQL 17,
Redis 8, and a small Python verifier. It stages an explicit source-file allowlist
under ignored `.tools/security-test-runs/`; it does not copy environment files,
Git history, patron uploads, databases, biometric models, or deployment artifacts.
It refuses remote Docker endpoints, uses an empty Compose interpolation file,
and does not publish ports or attach persistent data volumes. The runtime network
is internal; building/pulling images requires internet access. PostgreSQL uses
trust authentication only inside this disposable test network, never in production.

Checks exercise the actual SQL migrations and runtime-role operation twice,
preservation of synthetic existing records, browser-role denial on every table,
runtime CRUD/sequences and denied administrative operations, RLS enforcement,
foreign/unique constraints, session revocation/password binding, PostgreSQL row
locks, and concurrent counters shared by two independent Redis limiter clients.
Only named pass/fail results are printed; database/connection exception details
are withheld. The runner removes only its own uniquely named containers/network
and disposable volumes, including after failures. Images/build cache and staged
source remain locally for reuse/review.

The harness does not install Docker, enable Windows features, or restart the
computer. Its guards can be checked without Docker using
`python -m unittest discover -s scripts -p test_run_security_integration.py`.
On October 16, 2026, the local container verifier passed all PostgreSQL/Redis
checks above, and the eight runner guard tests passed. The runner removed its
test containers and network successfully. Docker readiness checks time out after
20 seconds per command rather than waiting indefinitely. These local results do
not establish Supabase pooler behavior, managed Redis TLS/ACL compatibility, or
Vercel client-address handling; those remain release-time checks.

## 1. Authentication release

The release adds `auth_sessions`: random session IDs, user foreign keys, password-
hash HMAC bindings, and creation/expiry timestamps. No raw bearer tokens are stored.
Logout deletes the presented sessions. Password changes and both reset paths
invalidate all old sessions and outstanding recovery codes. Successful password
changes issue a fresh HttpOnly cookie to preserve the active browser flow.
Bearer clients must log in again after a password change. Existing stateless JWTs
are rejected after rollout; warn users that one new login will be required.

The default backend dependency now denies temporary-password accounts access to
protected operations. Profile retrieval and password change use a narrower
session-validity dependency; logout is idempotent. Public catalog/auth endpoints
remain public. Librarian-created accounts no longer treat supplied contact details
as verified. Existing contact flags are preserved pending a separately approved
data review. Email/SMS delivery and administrator MFA are not added by this release.

1. Apply `supabase/migrations/20261016000100_auth_sessions.sql` to an isolated
   PostgreSQL target using its migration owner; repeat it and confirm existing
   users, verification flags, loans, and reservations are preserved.
2. The existing `backend/migrate.py` path also creates the table and applies RLS;
   it additionally runs existing backfills. Choose the narrow SQL upgrade for this
   release if no other backfill is intended. Do not regenerate the initial schema.
3. Verify anonymous/browser roles cannot read or write sessions. Test login,
   independent sessions, logout, password change/reset, suspended users, wrong
   roles/owners, temporary-password restrictions, and kiosk scans without tokens.
4. With explicit production migration/deployment approval, apply the additive SQL
   before releasing the new API. Keep `AUTO_MIGRATE=false`. Do not drop the table
   on rollback. Rolling back to stateless authentication restores the old security
   weakness and can make old tokens valid again; prefer a forward fix.

Expired sessions are removed for a user on subsequent login. A future approved
maintenance job may remove expired rows globally; no scheduler or retention policy
is silently added. Password and session changes use one transaction; password-hash
binding rejects sessions created from stale credential snapshots. Requests already
authorized and in flight are not retroactively cancelled by logout/reset.

## 2. Shared Redis limits

Redis support is prepared, not provisioned. `redis==8.1.0` is pinned in both Python
manifests and the uv lockfile; Docker installs requirements and Vercel uses uv.
Existing route limits remain unchanged. The added backend variables are:

| Variable | Deployment setting |
| --- | --- |
| `RATE_LIMIT_STORAGE_URI` | Server-only authenticated `rediss://USERNAME:URL_ENCODED_PASSWORD@HOST:PORT/0`; never a REST URL or browser variable. |
| `RATE_LIMIT_REQUIRE_SHARED` | Set `true` together with the approved endpoint so missing shared storage fails configuration validation. Default `false` preserves existing deployment compatibility. |

Use a separate development/preview Redis target. Production requires TLS with
certificate verification and forbids URL query overrides. Connection and socket
timeouts are two seconds, with no retry or memory fallback. A configured Redis
failure returns a generic 503 on limited routes, without performing the operation
or returning/logging the Redis URL. Redis must support the Lua operations used by
the existing `limits` package; test the provider's ACLs on an isolated service.

Keys contain a keyed digest of the ASGI client address, plus environment/route
names and window information. This is pseudonymous data, not anonymous data.
Application JWT secret rotation changes key digests and resets counters. No raw
email, phone, credential, or biometric value is added to rate-limit keys.

Before enabling live shared limits, confirm that Vercel's ASGI adapter supplies
distinct genuine client addresses and that spoofed forwarded headers cannot
change the bucket. The application does not trust arbitrary forwarded headers
for this key. Test two independent API instances against the same isolated Redis:
their combined attempts must hit the same limit; separate client addresses and
routes must remain isolated. Exercise outage/recovery and legitimate kiosk traffic.
These are per-address limits, not account-based or comprehensive abuse protection.

Provisioning, region/cost selection, connecting the endpoint, and production
environment changes require approval. Do not silently disable shared-required
validation or fall back to memory to resolve an outage.

## 3. PostgreSQL runtime role

`supabase/operations/prepare_runtime_role.sql` is a reviewable operation script,
not an automatically applied migration. It creates the non-login group
`rpl_app_runtime` with no administrative or RLS-bypass attributes. It grants CRUD
only on the 14 named application tables and usage/select on their ID sequences.
It retains RLS and denies PUBLIC/anon/authenticated table access. Its explicit
runtime-only policies allow the trusted backend to perform application operations;
FastAPI still enforces member/librarian roles and ownership.

Validate the script twice on isolated PostgreSQL before any production use. It
creates no login/password, changes no existing database connection, and aborts
on unexpected group attributes or a conflicting named policy. Review other role
memberships, PUBLIC grants, policies, functions, and default privileges as part of
the isolated check; this script is not a general privilege-drift repair tool.

Create a separate non-owner LOGIN through an approved secure administrative
channel, with no superuser/create-role/create-database/replication/RLS-bypass
attributes, and grant only `rpl_app_runtime` membership. Never grant this group to
`anon`, `authenticated`, `authenticator`, or any browser identity. Confirm the
login inherits the group, owns no application objects, and cannot assume a more
privileged role. Keep migration credentials outside the application's runtime.

Run `check_runtime_access.sql` as that login: all boolean checks must be true and
all 14 tables present. Also test sequence-backed inserts, updates/deletes, actual
runtime policies, denied DDL/TRUNCATE, and denied anon/authenticated access using
synthetic data. Metadata checks alone are insufficient. Verify TLS and Supabase
transaction-pooler connectivity using the new login before changing Vercel.

Only after those checks and explicit cutover approval, set the API's existing
`DATABASE_URL` override to the restricted connection, preserving pooler/TLS
settings. This override has a distinct runtime purpose; it is not a duplicate
added to silence warnings. Keep `POSTGRES_URL` available to verified integration
consumers until their migration is planned. A role cutover does not replace the
server-only Storage key. Future tables require explicit grants/policies; no
blanket default privileges are added.

## 4. Vercel integration and credential handling

The current frontend needs no Supabase resource connection. After identifying all
integration consumers, remove that unnecessary frontend connection. Keep required
API connection/Storage variables and the application signing/registration secrets.
Do not individually delete database URL variants on the assumption they are unused
outside this repository.

Vercel's documented integration conversion requires disconnecting the resource
from connected projects, rotating its secrets, reconnecting with Sensitive enabled
(excluding Development for that integration connection), and redeploying. Prepare
a maintenance window and recovery plan before requesting approval. Do not rotate
the application JWT secret as an incidental part of Supabase resource rotation;
doing so also invalidates sessions, upload/reset tickets, and the managed station PIN.

The production approval must name: projects to disconnect/reconnect, credential
families/consumers being rotated, the database migration and runtime-role operations,
the Redis endpoint/region/cost, affected variables, and deployments to release.
Never place secret values in the approval request, logs, Git, or documentation.

After an approved release, verify health, login/logout/reset, first-login routing,
private uploads/signed links, circulation/reservations/reports, kiosk behavior,
frontend headers, and the production artifact credential check. Use synthetic
accounts and records in staging; production probes must stay within approved scope.

References: [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles),
[PostgreSQL policies](https://www.postgresql.org/docs/current/sql-createpolicy.html),
[limits Redis storage](https://limits.readthedocs.io/en/stable/storage.html),
[Vercel integration secrets](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Dependency remediation and biometric review (implementation step 4)

Local review date: October 16, 2026. Package advisories identify affected versions;
they do not by themselves demonstrate an exploitable route in this application.
No credentials, production configuration, biometric policy, or patron data were
changed during this step. The earlier pending PAD implementation remains separate.

| Dependency group | Updated versions / reason |
| --- | --- |
| Frontend HTTP/routing/build | Axios 1.20.0, React Router DOM 7.18.4, Vite 7.3.7, PostCSS 8.5.30; compatible advisory-related transitive updates in `frontend/package-lock.json`. |
| Spreadsheet parsing | SheetJS 0.20.3 from the publisher's versioned HTTPS tarball, with npm-generated integrity in the lockfile. The npm registry's 0.18.5 release has no registry update that fixes the reported issues. |
| API and form parsing | FastAPI 0.135.2, explicitly pinned Starlette 1.3.1, python-multipart 0.0.31. FastAPI was updated to permit patched Starlette. |
| JWT/crypto/configuration | python-jose 3.5.0, cryptography 50.0.2, python-dotenv 1.2.2. |
| Images and PDF verification | Pillow 12.3.0 and pypdf 6.19.0. pypdf is used by report/QR tests, not by an application PDF-upload route. |

Both backend manifests and the generated uv lockfile were updated. The minimal
PostgreSQL/Redis harness matches the relevant application pins. NumPy, OpenCV,
dlib, recognition thresholds, model weights, and PAD code were not changed in
this dependency pass. Docker requirements explicitly retain setuptools 80.10.2
to match uv's face-model compatibility requirement.

The frontend npm lockfile audit reports zero advisories, down from 19 affected
package nodes (14 high, 3 moderate, 2 low). The OSV query of locked PyPI packages
reports three affected packages, down from nine. These are dated scan results,
not a guarantee against undisclosed vulnerabilities. Keep using the committed
lockfiles; do not revert SheetJS to the stale npm release. See the publisher's
[installation documentation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

October 16 findings (the python-jose and ecdsa entries are resolved by the October
17 integration above; the setuptools finding remains unsuppressed):

| Package / advisory severity | Applicability and follow-up |
| --- | --- |
| python-jose 3.5.0 — critical, `GHSA-3qf3-8w2g-rqmx` | DER public-key/HMAC algorithm confusion. Session and upload-ticket decoding explicitly restrict algorithms; the configured design uses a private HMAC secret, not a public verification key. No exploit was established in that flow. Upstream has no fixed release in the scan. Do not introduce asymmetric keys or mixed algorithm acceptance without redesign/review; evaluate a JWT-library replacement separately. [Upstream issue](https://github.com/mpdavis/python-jose/issues/414). |
| ecdsa 0.19.2 — high, `GHSA-wj6h-64fc-37mp` | Transitive python-jose dependency; timing leakage concerns ECDSA signing/key generation/ECDH, none used by the current HMAC token flow. No upstream fix is planned. Retain the finding and reconsider the dependency with any JWT redesign. [Maintainer advisory](https://github.com/tlsfuzzer/python-ecdsa/security/advisories/GHSA-wj6h-64fc-37mp). |
| setuptools 80.10.2 — moderate, `GHSA-h35f-9h28-mq5c` | Unicode filename exclusions can fail when publishing source distributions, particularly on macOS. This repository does not publish an application sdist. Version 83 fixes it, but the existing `face_recognition_models` package imports `pkg_resources`, removed in newer setuptools. Keep the explicit compatibility pin; use an isolated modern build tool if publishing an sdist, and review migration of the face-model package separately. [Maintainer advisory](https://github.com/pypa/setuptools/security/advisories/GHSA-h35f-9h28-mq5c). |

The approved biometric scope was review only, against the separate `photo-spoofing`
working tree. Its source and regression tests confirm
model checksum checks, locked inference, rejection of failed/uncertain/unavailable
PAD results before access, screening of every recognition box in group frames,
and protection of existing enrollment when PAD fails. Raw spoof snapshots and
JSON embeddings still exist in the design; explicit consent, retention, deletion,
and application-level encryption workflows remain gaps. No new policy, data purge,
model download, or claim of biometric accuracy was introduced. Follow the existing
physical-camera acceptance requirements in `backend/assets/anti_spoof/README.md`
on that branch
before considering the pending PAD work for deployment.

Local verification for the updated dependencies in the combined working tree
before separating the security and PAD commits:

- Backend suite: 185 passed, 11 warnings; includes synthetic authorization/storage
  checks and existing public upstream PAD reference tests. No physical camera test.
- Frontend lint and production build passed; build credential scanner passed on
  64 files using its patterns and available environment secrets. This did not
  fetch production secrets or rescan the live deployment.
- Frontend API/helper and scanner tests: 56 passed. Separate in-memory synthetic
  XLSX, XLS/BIFF8, and CSV parsing checks passed with SheetJS 0.20.3.
- All disposable PostgreSQL/Redis integration checks passed again after the API
  dependency updates; eight runner guard tests passed. Cleanup succeeded.
- Full browser workflow checks, optional InsightFace runtime, production cloud
  connectivity, and a full application Docker image build were not verified here.

Reproduce using the commands in [AGENTS.md](../AGENTS.md), plus
`node --test frontend/scripts/*.test.mjs`, `npm --prefix frontend audit --package-lock-only`,
and the local integration runner documented above. Audit results may change as
new advisories are published. No push, deployment, or live migration was performed.

Before committing `security-hardening`, the exact staged tree was exported and
verified separately: 130 backend tests and 56 frontend/scanner tests passed;
frontend lint, production build, and the 64-file artifact check passed. PAD
services, models, and PAD-specific test mocks are excluded from that branch.
`photo-spoofing` builds on this security baseline and retains the separate
hardware-acceptance requirement. The previously committed PIN/project guidance
on `main` and interface work on `ui-update` are not duplicated as new changes.
