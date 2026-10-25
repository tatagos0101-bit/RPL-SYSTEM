# Runtime database-role audit and rehearsal — October 19, 2026

Latest follow-up, October 25: the live API now uses the restricted account after
16-table permission, full-API synthetic workflow and real Storage acceptance.
The clean main-source release is promoted, public health/access checks passed,
and the runtime login remains enabled. A subsequent [owner-credential cleanup](OWNER_CREDENTIAL_RETIREMENT.md)
removed owner variables from the new live runtime. The operator confirmed the
provider password reset and post-reset cloud checks passed. Earlier sections record
historical preparation/diagnostics.

## Historical production finding — October 19

A fixed read-only catalog query through the API's configured database connection
confirmed that the live runtime is an **owner/admin-capable role**, not the prepared
restricted runtime role. This is excessive privilege; it is not evidence of a
successful attack or a newly demonstrated application exploit.

| Metadata check | Observed result |
| --- | --- |
| Read-only audit transaction; direct login | Both true |
| Superuser | False |
| Create database / create role / bypass RLS / replication attributes | All true |
| Application tables present | 14; no deployed-baseline tables missing |
| Pending repair tables absent | 2: `reservation_confirmations`, `inventory_writes` |
| Application tables owned, including inherited ownership | 14 |
| Tables with RLS enabled | 14 |
| Tables applying RLS to this runtime | 0; the current role bypasses it |
| Tables with extra/delegable privileges | 14 |
| Tables accessible to `anon` or `authenticated` | 0 for either role |
| Restricted `rpl_app_runtime` group | Absent |
| Executable public SECURITY DEFINER functions | 0 for this connection |

Other catalog counts showed 13 additional memberships, eight delegable memberships,
one owned database and two owned application schemas. No role/database names,
passwords, function bodies, patron rows, biometric values or connection strings
were returned. The group and runtime-login separation remains unimplemented live.

## Safe observation method

The tested [probe](../scripts/runtime_role_probe.py) was staged with only its fixed
[catalog SQL](../supabase/operations/audit_runtime_identity.sql), the existing
database connection helper, and minimal matching package pins. It was deployed to
the API project as a production-environment candidate with domain assignment skipped.
This let the cloud use its existing connection configuration without downloading it
or opening local deployment-access artifacts.

The probe required a random temporary bearer token, production configuration,
`AUTO_MIGRATE=false`, and an expiry of at most one hour. It accepted no SQL/URI input,
disabled API documentation, returned `no-store`, and withheld database exceptions.
The collector used explicit `BEGIN READ ONLY`, five-second statement and one-second
lock timeouts, and `ROLLBACK`. It imported no application startup, models or migration
path. Authenticated output contained only booleans and counts; unauthorized access
returned 403 before opening a database connection.

The temporary deployment was removed afterward. The API's live deployment and
project environment metadata were unchanged. Post-audit checks passed on both
public origins: healthy `/health` responses and 401 for anonymous profile/librarian
stat requests. Frontend guard release `c18c05b`, API baseline `8975023`, Redis staging,
and the independent PAD work remain as before. No production role, grant, schema,
patron record or runtime connection change was performed.

## Implemented verification improvements

[check_runtime_access.sql](../supabase/operations/check_runtime_access.sql) now
also requires:

- A direct restricted login, inherited runtime group, no additional memberships
  (including non-inherited ones), and no ability to delegate role membership.
- No database/application-schema ownership and no direct or inherited table
  ownership. Runtime RLS must actually apply, not merely be enabled on the table.
- All 16 repair-schema tables present, with required CRUD and browser denial.
- No extra TRUNCATE/REFERENCES/TRIGGER privileges or table grant options.
- Required sequence USAGE/SELECT, with no UPDATE/setval or sequence grant options.
  String/composite-key tables do not falsely require sequences.

The verifier reports booleans/known table names only. It detects drift; it does not
silently revoke unexpected grants or repair memberships. The separate identity
audit tolerates absent future tables so it can describe the current live baseline.
These checks do not constitute a complete audit of every schema, default privilege,
extension, function or platform role.

## Rehearsal and tests actually run

- The existing disposable PostgreSQL 17/Redis 8 integration runner passed with
  the updated explicit source allowlist. Provisioning and additive migrations ran
  twice, preserving synthetic existing contact flags, loan/copy history and queue
  state. Runtime CRUD, sequences, constraints, RLS, denied browser access, session
  revocation, concurrent circulation and shared Redis checks passed.
- New negative cases proved rejection of missing sequence USAGE, excess sequence
  UPDATE, a non-inherited extra membership, delegable role membership, table grant
  options, excess TRIGGER privilege, inherited table ownership, elevated CREATEDB,
  and a missing required table. Each synthetic grant change was restored, and the
  healthy verifier passed again. Containers/network were removed successfully.
- 30 focused probe/runner/deployment-configuration tests passed. Probe tests covered
  missing/wrong authorization, bad/expired/overlong expiry, non-production and
  migration-enabled configurations, ignored SQL query input, and credential-safe
  failure responses. Existing deprecation warnings remain.
- The first local verifier run incorrectly required a sequence for string-keyed
  `auth_sessions`; it was corrected before both successful rehearsal runs.
  A later mistyped test filename ran no tests; the corrected focused command above
  passed. No frontend checks or full application suites were rerun for this batch.

## Production cutover requirements

The local preparation/verifier targets **16 tables**, whereas live has **14**. Do
not run the repair-branch preparation against live now: it must fail and roll back
when the required repair tables are missing. Do not create empty stand-ins or
silently skip missing tables to pass the check.

The recommended release path is to coordinate the restricted runtime cutover with
the [repair rollout](REPAIR_ROLLOUT.md):

1. Complete its authorized backup/recovery and production-shaped migration rehearsal.
   Resolve any reported identity/hold conflicts explicitly; preserve receipts/history.
2. During the reviewed rollout, apply the actual repair schema and reviewed 16-table
   role preparation as the migration owner. Keep `AUTO_MIGRATE=false`.
3. Securely create a separate non-owner LOGIN with no elevated attributes and only
   inherited `rpl_app_runtime` membership, without admin/grant options. Keep owner
   credentials outside the application. Do not revoke privileges from the existing
   provider owner as an incidental cleanup.
4. Validate the new login through the actual Supabase TLS transaction pooler, with
   the verifier and authorized synthetic application operations. Keep `NullPool`
   and psycopg automatic prepared statements disabled. Test private Storage through
   its separate server credential; changing the DB login does not replace that key.
5. Review the exact API candidate, `DATABASE_URL` override, table grants and recovery
   path before changing the runtime connection. Keep the previous healthy connection
   recoverable for an explicitly approved incident decision; do not drop roles or
   rotate unrelated JWT/Storage secrets as part of the switch.

The alternative 14-table preparation below is now locally rehearsed. It allows a
separate runtime-role rollout before the repair release, subject to the actual
Supabase login/pooler and candidate checks. Do not advance the whole repair branch
merely to obtain this permission change. Live cutover remains pending.

## Deployed-baseline candidate — October 19 follow-up

The explicit [14-table preparation](../supabase/operations/prepare_runtime_role_baseline14.sql)
and [14-table verifier](../supabase/operations/check_runtime_access_baseline14.sql)
match API source `897502349ae16f52209bc2d533566d2e08d3f2d1`. They retain the
owner/membership/delegation/sequence/RLS checks described above. Preparation uses
a transaction, bounded lock/statement timeouts and the migration advisory lock;
it refuses missing required tables, conflicting existing policies or either
pending repair table. It creates the NOLOGIN permission group, grants CRUD and
sequence USAGE/SELECT on the explicit baseline list, enables RLS and revokes
browser-role access. It creates no login/password and changes no application rows,
table definitions, owner credentials or runtime connection settings.

Run the isolated rehearsal from the repository root:

```powershell
python scripts/run_baseline_role_integration.py
python -m unittest discover -s scripts -p test_run*integration.py
```

The [runner](../scripts/run_baseline_role_integration.py) reads only allowlisted
source files from that exact Git revision, plus the current test harness and
reviewed SQL. It fails if the baseline objects are unavailable; it never substitutes
repair/PAD source. No environment files, uploads or database copies enter the build
context. Docker must be local; the disposable PostgreSQL 17/Redis 8 network is
internal with no published ports. The fixture uses local trust authentication,
not Supabase TLS or password authentication. Additional HTTP-test dependency pins
match the baseline lockfile; application dependency manifests are unchanged.

Completed evidence:

- Baseline run `rpl-security-0441b6f2aa34` passed with exactly 14 tables, repeatable
  preparation/migration and preserved synthetic existing history/contact flags.
- Real restricted-login PostgreSQL grants, CRUD, sequence access, enforced RLS,
  browser denial, session revocation and competing circulation locks passed.
  Missing/excess grants, role delegation, inherited ownership and elevated
  attributes were detected. The final verifier passed again after all fault cases.
- The baseline's actual password-login, transaction, reservation and report routers
  ran via FastAPI TestClient against PostgreSQL. Cookie authentication, borrowing,
  original-loan returns, queue promotion/cancellation, PDF generation, logout and
  anonymous/wrong-role/suspended/cross-owner denial passed. A synthetic attendance
  row was written through the ORM; no face/camera or PAD endpoint was exercised.
- Switching the test dependency from restricted connection to owner and back
  preserved session access and transaction results. This rehearses connection
  recovery only, not a Vercel deployment/environment rollback.
- Missing-table and policy-conflict preparation failures rolled back. Both baseline
  on repair-shaped schema and repair preparation on baseline schema were rejected.
- Existing 16-table integration run `rpl-security-d567c4a4b85a` passed after the shared
  harness changes. Both runs removed their containers and networks successfully.
- Eleven runner tests passed, including byte-for-byte baseline source provenance,
  explicit staging boundaries, missing-object refusal and dependency-pin checks.
  Initial baseline HTTP attempts exposed a synthetic fixture that omitted the fine
  amount; the fixture now supplies zero. No application fix was needed. The
  existing Starlette/httpx deprecation warning remains.

These checks use reconstructed baseline schema and synthetic records, not a
production backup. They establish selected route compatibility with restricted
PostgreSQL permissions, not complete application, report accuracy, Storage,
real-camera or Supabase pooler acceptance. No production resources or configuration
were changed during this follow-up. Frontend/full-backend suites were not rerun
because only operational SQL, harnesses and documentation changed.

### Concrete production switch and recovery plan

1. Recheck the live API revision, 14-table catalog, deployment IDs and environment
   **names/metadata**. Stop if they differ from this candidate. Confirm the
   provider's backup/recovery path before permission changes; never export patron
   data into this repository or test harness.
2. As the maintenance owner, apply only `prepare_runtime_role_baseline14.sql`.
   Create a separate non-owner API LOGIN with `INHERIT NOSUPERUSER NOCREATEDB
   NOCREATEROLE NOBYPASSRLS NOREPLICATION`, only `rpl_app_runtime` membership and
   no ADMIN OPTION. Generate/store its password through a protected credential
   workflow; never paste it into this document, chat, logs or committed SQL.
   If a matching login already exists, inspect it instead of silently altering it.
3. Connect as that login through the actual Supabase TLS transaction pooler, with
   the existing connection helper (`NullPool`, prepared statements disabled).
   Require all 15 verifier rows to pass (one role row and 14 table rows). Any
   unexpected inherited/PUBLIC privileges require explicit review, not broad
   revocations of provider roles. Keep the owner's existing privileges intact.
4. Stage an API candidate using **only deployed `8975023` application code** and
   a deployment-scoped restricted `DATABASE_URL`; keep `AUTO_MIGRATE=false`.
   Preserve the separate Storage/JWT/PIN configuration. Before promotion, verify
   protected health/access behavior and agreed synthetic login, circulation,
   reservation, reporting and private-Storage operations through the cloud path.
   Local TestClient results do not replace this acceptance.
5. After candidate acceptance, set the API Production `DATABASE_URL` as Sensitive,
   deploy/verify the same candidate and switch the API public alias. Record only
   deployment IDs and non-secret outcomes. The frontend needs no code deployment.
   Remove superseded owner connection variables from the active API environment
   only after inventorying their integration ownership/consumers; otherwise the
   owner secret remains available even though normal queries use the new login.
6. If acceptance fails, leave the public alias and production configuration in
   place. If failure occurs after promotion, restore the recorded previous healthy
   API deployment and previous environment state using the protected recovery
   workflow. Do not drop roles, revoke the provider owner's privileges or rotate
   JWT/Storage keys as rollback. Recheck health and authenticated flows before
   retrying. Existing deployment secrets require a separate retirement decision.

The later permissions-only preparation completed the group/account portion of
step 2. October 20 completed the credential handoff and step 3's actual pooler
verification, then restored NOLOGIN. Steps 4–6's application acceptance, production
switch and recovery verification remain pending. Backup/recovery inventory has
not been verified; it remains a gate for the future repair schema rollout.
The future repair upgrade must apply the standard 16-table permission operation
and verifier; do not keep using the baseline variant after that schema change.

### Read-only pooler acceptance checker

[check_runtime_candidate.py](../scripts/check_runtime_candidate.py) now implements
the connection/metadata portion of step 3. Run it with the backend Python environment:

```powershell
uv run --project backend python scripts/check_runtime_candidate.py --pooler-host HOST --project-ref REF --role ROLE --schema baseline14
```

Use the new candidate URI through a protected `RPL_RUNTIME_CANDIDATE_URI`
environment setting or the hidden interactive prompt. Never place it in command
arguments, chat or committed files. The tool does not read `.env`, application
configuration or owner credential artifacts, and never falls back to `DATABASE_URL`
or `POSTGRES_URL`. Its child process excludes inherited credentials and libpq
connection overrides. Only the existing connection-settings helper is imported.

Target checks require the exact selected Supabase shared-pooler hostname, project
reference and new `rpl_` login, database `postgres`, port 6543, a password and an
allowed SSL mode. Connection query overrides are rejected except SSL mode/root CA.
The tool retains `NullPool` and disabled automatic prepared statements, checks
encrypted transport and the actual current/session role, then runs fixed read-only
catalog SQL. All 15 baseline verifier rows must pass; `repair16` requires all 17
rows. Partial, duplicate, unexpected or false results fail closed. The output
contains only success/counts or a generic failure, never URIs or database errors.
It accepts the application's existing `sslmode=require`; encryption success alone
does not establish certificate/hostname validation unless a verifying SSL mode is used.

Twenty-nine focused tests passed for target/driver-override rejection, secret
isolation, missing credentials, incomplete/failed metadata, both schema variants,
transport/identity refusal and connection cleanup. These are mocked transport and
validator checks, not evidence that a real Supabase candidate login was tested.
The new checker does not replace the subsequent cloud application/Storage checks.
Supabase administration access was initially unavailable, then became available
for the permissions-only follow-up below; see [current status/counts](IMPLEMENTATION_STATUS.md).

References: [PostgreSQL privilege and role-information functions](https://www.postgresql.org/docs/17/functions-info.html),
[read-only transactions](https://www.postgresql.org/docs/17/sql-set-transaction.html),
and [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Live disabled-candidate preparation

On October 19, the connected project `quzhxkgkdrctiosyjxcr`
(`supabase-rizal-library`) was ACTIVE_HEALTHY on PostgreSQL 17.11 and the Free plan.
The catalog contained the expected 14 baseline tables, all with RLS enabled and
browser roles denied. No existing table policies or runtime group/candidate existed.
Backup inventory and a restorable recovery point were not established by the
available tools. Free-plan status alone does not establish whether a usable backup
exists. No backup export or paid resource change was performed.

The provider migration `20261019141808_stage_disabled_runtime_account_baseline14`
applied `prepare_runtime_role_baseline14.sql` and
[create_runtime_candidate.sql](../supabase/operations/create_runtime_candidate.sql)
in one transaction with timeouts, an advisory lock and a fresh-role guard. It added
the restricted NOLOGIN group, backend CRUD/sequence permissions and policies, and
the NOLOGIN/passwordless candidate with only group membership and no ADMIN OPTION.
No patron rows, table definitions, existing owner permissions, credentials or API
configuration were changed. This reversible permission preparation did not perform
the separately gated schema migration or connection cutover.

Post-change catalog checks passed for candidate/group attributes and membership,
all 14 expected policies, table CRUD and sequence access, no ownership/delegable or
extra table privileges, and continued browser denial. Connector impersonation via
SET ROLE was refused; no broader connector privilege was granted. The fallback
checks targeted the candidate by name and inferred RLS applicability from role
attributes/ownership. They do **not** establish actual candidate login, transport
identity or cloud application acceptance. Security advisors returned no lints
after the prior 14 informational RLS-without-policy notices; this is not a claim
that all project security work is complete.

Local PostgreSQL baseline run `rpl-security-d1896739430c` passed, including the new
candidate's disabled/passwordless state, inherited restrictions and refusal to
overwrite an existing account. Its containers/network were removed. Eleven runner
unit tests passed; the existing Starlette/httpx deprecation warning remains.
Public API and frontend health returned 200; anonymous profile and librarian stats
returned 401 on both paths. Authenticated live flows and full frontend/backend
suites were not rerun for this operational change.

At this stage, the remaining handoff was a password supplied through a protected provider channel
and a transaction-pooler URI stored as `RPL_RUNTIME_CANDIDATE_URI` in the API project's
Preview environment, type Secret (formerly Sensitive). Never store this credential
in chat, committed SQL, command arguments or diagnostic output. Keep NOLOGIN until
ready for controlled acceptance; verify the exact pooler host from the project's
Connect panel. Only after real pooler and cloud API acceptance should the reviewed
production connection switch proceed. If blocked or acceptance fails, leave the
candidate disabled and the existing API configuration/alias in place; do not drop
roles, modify patron data or revoke provider-owner access as recovery.

## October 20 Preview credential validation

Vercel metadata confirmed `RPL_RUNTIME_CANDIDATE_URI` is Sensitive/Secret, scoped
only to Preview with no branch restriction. Its value was not downloaded. The
temporary [Preview probe](../scripts/runtime_candidate_probe.py) exposes only
fixed checks, requires Preview mode, `AUTO_MIGRATE=false`, an expiring random bearer
token, and no-store responses. The final cloud probe removes inherited libpq
overrides and database/Storage connection variables, then invokes the fixed verifier
with only the explicit candidate URI. The standalone CLI retains its child-process
isolation. Neither path imports the application configuration or startup.
Only the fixed project/login/baseline schema can be tested; there is no caller SQL
or URI input. A separate protected configuration-only route returns fixed boolean
fields without opening a database connection. Worker failure diagnostics are
limited to allowlisted categories, never raw exception strings.

Fifty-two focused checker/probe tests passed, including unauthorized refusal,
expiry, production-mode refusal, configuration-only secret redaction and inherited
connection-override removal. Existing Starlette/httpx and AnyIO warnings remain.
No application or PAD code changed; full application suites were not rerun.

Connection attempts in `dpl_Dq32TpD32JM8ERkrQ9kEk5Udzfp9`,
`dpl_J5RovdNEmgX8KcKFJGgsWSDsa6D6` and
`dpl_39nm4HKmEM9Eh4MrKnYqySUVqfHn` failed before database authentication. Each
temporary LOGIN enablement was followed by NOLOGIN restoration. The configuration
diagnostic `dpl_FtdtsHs91wY6cTFTWp4ZmkYdMqyp` ran with the role disabled and showed
only the expected-username check false; presence, parsing, driver, shared-pooler
hostname shape, port, database, password presence, query options and SSL mode passed.
These format checks do not verify the password or independently establish that
the supplied host belongs to the project. The user was asked to correct only the
username to `rpl_api_runtime.quzhxkgkdrctiosyjxcr` through Vercel.

All four temporary Previews rejected unauthorized requests and were removed. The
production deployment ID and project environment metadata were unchanged by each
test (the user's intervening credential edits are separate). Public API/frontend
health returned 200 and anonymous profile access returned 401 after the first
attempts. Candidate authentication, live permission checks, cloud application
acceptance and production cutover remain pending; no patron rows were queried.

After the user corrected the username, `dpl_3JX3kDMuuTkPVFUYowHXkCGyJB2U`
passed all ten configuration-format checks. Its connection worker did not return
a usable verification result; this did not establish a password failure. The
Preview was removed and NOLOGIN restored. A dependency-path attempt in
`dpl_BXJXfwhmjcNdPGQKqJUsGHdHMcUJ` still failed; missing bundled dependencies were
not established as the cause. `dpl_7UDXLg7EFfHHngQBftS1ihGEKbfj` confirmed the
checker, connection helper, metadata SQL, Python executable and TLS attribute all
exist, but connection verification still failed. The direct verifier in
`dpl_8yT47p2ovxqhU9YAx4C8FGx94Fxi` localized the failure to opening the connection,
before identity or permission queries. All these Previews were removed and the
candidate returned to NOLOGIN. No password-authentication outcome is claimed from
these generic failures; fixed error-type/SQLSTATE diagnostics were prepared next.

`dpl_E8ZTxku3XXVVSbsyne5QML1KXzCf` returned an OperationalError at the connect
stage with no SQLSTATE, before any identity/permission query. The diagnostic
exposed only an allowlisted exception type and code, not its message or URI.
The driver can raise an unwrapped OperationalError, so classification now handles
both driver and SQLAlchemy errors. The exact assigned pooler host was requested
from the project's Connect panel (hostname only); the password was not requested.
This Preview was removed, project environment/production deployment metadata
remained unchanged, and NOLOGIN was restored. Pooler acceptance remains incomplete.

The user subsequently confirmed `aws-0-ap-southeast-1.pooler.supabase.com` from
Supabase Connect. Local DNS/TCP checks reached it, and the next protected Preview
confirmed the saved URI uses that exact host. A boolean-only metadata query
(`rolpassword IS NOT NULL` for the candidate only) returned false. No password or
hash was retrieved. This establishes that Supabase password setup is missing;
Vercel password presence alone does not establish a usable credential. The user
was asked to set the same candidate password privately in Supabase with NOLOGIN
retained. Future enablement must first confirm password presence as well as role
restrictions; no further login attempt is needed until that handoff is complete.

## Successful real pooler acceptance — October 20

The user set the candidate password privately in Supabase. A boolean-only recheck
confirmed password presence and NOLOGIN, then guarded enablement required both
password presence and the expected restricted attributes/membership. The already
prepared protected Preview `dpl_42vqYH9r2MZK6rf2VetzJGNG7fo5` passed:

- Exact operator-confirmed transaction-pooler host, project/login, port/database,
  allowed SSL mode/query options and required packaged files.
- Actual TLS-encrypted connection through the shared pooler, with the expected
  current/session login and a read-only identity transaction.
- Every role check and all 14 table results from the fixed baseline verifier,
  including RLS applicability, CRUD/sequence permissions, no ownership/admin or
  extra/delegable privileges, and continued denial to browser roles.

The connection uses the existing SQLAlchemy helper, NullPool and disabled automatic
prepared statements. `sslmode=require` establishes transport encryption here, not
certificate/hostname validation. No application records or biometric contents were
read, and no application startup, migration, API circulation workflow or Storage
operation was exercised. This is credential/permission acceptance, not complete
production application acceptance.

The Preview was removed, the candidate restored to NOLOGIN, and the existing
production API deployment and project environment metadata preserved. A final
boolean-only check confirmed password presence, disabled login and restricted
attributes. Supabase security advisors returned no lints. Public API and frontend
health returned 200; anonymous profile access returned 401 on both paths. The user
need not supply another credential for this milestone.

Next is step 4's protected baseline API workflow acceptance, followed by the
reviewed production switch/recovery procedure. The live API still uses its owner
connection; the original security follow-up remains open until those gates pass.
PAD and unrelated working-tree changes remain untouched.

## October 24: current 16-table acceptance

The deployed application is now `03525120ad49e862ec84dfc70fc518fa34d0333f`.
Do not reuse the earlier 14-table release candidate. A fresh catalog check found
the restricted account still disabled and correctly restricted, but missing CRUD
and runtime policies for `reservation_confirmations` and `inventory_writes`.
Switching the application connection at that point would break those operations.

Applied the already rehearsed `prepare_runtime_role.sql` with transaction-local
lock/statement timeouts through provider migration
`complete_runtime_permissions_repair16`. All 16 application tables now have the
required runtime CRUD and policies, RLS remains enabled, and browser roles remain
denied. No application records, table definitions or live connection settings were
changed by this permission preparation.

The protected Preview checker now pins `repair16` and requires all 17 verifier
rows. Preview `dpl_AwHKkFBjq5Dnzn6TcSTf7mFbJraY` passed the actual TLS pooler
connection, expected login, and every role/table/sequence permission check.
The Preview was removed, NOLOGIN restored, and production deployment/environment
metadata preserved. A final catalog check confirmed password presence, disabled
login and restricted attributes; security advisors returned no lints.

The temporary `runtime_workflow_probe.py` additionally prepares selected current-main
API route checks using only generated synthetic identities and inventory. Route
commits use savepoints inside an outer transaction that always rolls back. It is
protected by the existing Preview/token/expiry/candidate-verification guard and
rejects repeat/concurrent execution within an instance. It never mounts the main
application, runs startup/migration, invokes face endpoints, or queries patron-wide
reports. Only fixed boolean outcomes leave the endpoint. It must never be mounted
in the production application. Sequence allocations can leave harmless gaps.

Local PostgreSQL 17 rehearsal passed login/Secure HttpOnly cookies, anonymous and
wrong-role denial, owner-scoped loans, borrowing/returns, reservation promotion and
cancellation, synthetic-member transcript generation, attendance and inventory
receipt access, suspension and logout revocation. A deliberately revoked inventory
INSERT grant caused failure as expected. Both successful and failing runs left all
ten written tables empty after rollback. Cached images were reused, data was
RAM-backed, and each temporary container was removed. The focused checker/probe
suite passed 68 tests; existing Starlette/httpx deprecation warnings remain.

The first workflow Preview stopped at its packaging self-check before database
access. The checker now resolves its artifact from `CHECKER_ROOT` when imported;
a regression test covers this layout. The replacement protected Preview
`dpl_79b8AYagGWjJuYVy1VzLG9jHJtGL` passed the same workflows against the real
Supabase transaction pooler as the restricted account. Its current-main application
modules were copied from immutable Git objects, not the dirty PAD/Redis worktrees.
It confirmed the synthetic users/book were absent after rollback. The Preview was
removed and NOLOGIN restored; the production deployment and environment metadata
were unchanged. The final catalog check confirmed disabled login, password presence
and restricted attributes. No patron data or credentials were returned.

Storage objects, real-camera behavior and public browser workflows are outside
this rollback-only probe's coverage. The previously proposed full API/Storage
candidate acceptance is not equivalent to this selected-route cloud rehearsal;
remaining release checks must be stated explicitly when requesting cutover.

### Current switch/recovery candidate (not executed)

- API project: `rpl-system-api`; existing healthy production deployment:
  `dpl_8gmqdS2rSyRWC1QZ5WksRBJPD1a3`, application revision `0352512`.
- Recheck that revision/metadata and current role restrictions before proceeding.
  Stage only the reviewed current-main application, never either temporary probe.
- The verified credential is still Secret/Sensitive, Preview-only, under
  `RPL_RUNTIME_CANDIDATE_URI`. No Production `DATABASE_URL` override exists.
  For cutover, securely configure the verified restricted URI as the API's
  Production-only Sensitive `DATABASE_URL`. Keep `AUTO_MIGRATE=false`, TLS/pooler
  options, Storage, JWT and station PIN unchanged. Do not retrieve the Sensitive
  value into chat/logs or silently downgrade its type.
- Enable the guarded runtime LOGIN only for the approved candidate release.
  Require production health, restricted runtime identity and access smoke checks
  before promotion, plus agreed remaining application/Storage acceptance. Do not
  promote an operational probe. Frontend deployment is unnecessary.
- Before public promotion, record a secure reversible environment change and the
  exact previous deployment. On failure, restore the previous deployment and
  remove the new override (or restore its recorded prior state). Confirm service
  recovery before disabling the candidate. No data/schema restore is needed for
  a connection-only rollback; do not overwrite new library transactions.
- Production `POSTGRES_URL` still exists as an encrypted owner credential.
  Connection switching alone does not remove that credential from the process or
  old deployments. Review integration ownership/consumers before its separate
  retirement; do not claim full credential isolation while it remains accessible.

No production activation, commit or push was performed in this readiness pass.
PAD and Redis activation remain pending and untouched.

## October 25: preparation before the secure credential handoff

The operator approved final API/Storage validation and production activation only
if those checks pass. Fresh metadata still showed the previous healthy API
`dpl_8gmqdS2rSyRWC1QZ5WksRBJPD1a3` on `0352512`, no Production `DATABASE_URL`,
and the candidate credential as Preview-only Sensitive. Role restrictions matched.

Prepared a protected, unaliased full-API candidate using immutable current-main
source and the new `runtime_release_probe.py`. Every request to that diagnostic
candidate requires an expiring private header; the probe checks the actual loaded
database configuration/role, all 16 permissions, rollback-only API workflows, and
synthetic Storage uploads/reads/signing/deletion across the four categories. It also
checks avatar ticket ownership and profile refresh. No such diagnostic code is to
be included in the separately built clean release artifact.

The expanded tool suite passed 76 tests. Local PostgreSQL checks passed success
and injected-permission-failure rollback, plus current-main full API routes,
middleware and the protected-candidate header. Test-only in-memory limits were reset
between repeated scenarios; no live rate settings changed. Temporary containers
were removed. This local run does not establish cloud Storage acceptance.

The proposed server-side rename of the saved Sensitive candidate variable was
rejected without changing project environment metadata. Vercel explicitly forbids
editing a Sensitive variable's key and does not return its saved plaintext value;
see [Sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).
Do not retry the rename, retrieve the secret through a diagnostic route, or change
the application to consume a candidate variable as a workaround.

At this stage the operator was asked to privately add **`DATABASE_URL`**, Secret/Sensitive and
**Production-only**, using the previously verified restricted-account URI, leaving
`RPL_RUNTIME_CANDIDATE_URI` in Preview. Do not redeploy from the dashboard yet.
The confirmed endpoint uses username `rpl_api_runtime.quzhxkgkdrctiosyjxcr`, host
`aws-0-ap-southeast-1.pooler.supabase.com`, port `6543`, database `postgres`, and
`sslmode=require`. The account password must be URL-encoded; it is not the project's
`postgres` password. No password is recorded here or requested in chat.

The account was restored to NOLOGIN and reverified after the rejected rename.
No full-API cloud candidate, clean release, public promotion, commit or push had yet occurred.
The approved rollout was to resume after the secure handoff: verify only variable metadata,
enable the guarded account, run final protected cloud checks, remove the diagnostic
candidate, build the exact clean main artifact, verify it, then promote. Keep the
existing frontend deployment and Storage/JWT/PIN/Redis settings unchanged.

The ignored `.tools/runtime_cutover.py` has an `adopt` action for the user-created
Production variable; do not rerun its superseded `configure` rename attempt.
Its rollback removes only that new Production override and restores the recorded
previous API deployment, preserving the Preview candidate variable. The state file
contains deployment/variable metadata only. Owner-credential retirement remains
separate from this approved connection switch.

## October 25: production switch completed

The operator saved the new Production-only Sensitive `DATABASE_URL` privately.
Metadata-only adoption confirmed that the Preview candidate and all pre-existing
environment entries were unchanged. Guarded provider migration
`enable_runtime_after_production_secret_handoff` enabled LOGIN for the restricted
account. `rpl_api_runtime` retains only the non-admin runtime group membership;
it has no ownership, create-role/database, bypass-RLS or replication capabilities.
Keep LOGIN enabled now that the production API uses this account.

Protected, unaliased full-API candidate `dpl_DecRTVKwsdqdm9jy8v8dC6NHw8fw` passed:

- Actual application-engine identity, encrypted pooler connection and every
  `repair16` role/table/sequence permission check.
- Synthetic password login and Secure HttpOnly cookies, anonymous/wrong-role/
  cross-owner denials, borrowing and original-loan returns, reservation promotion
  and cancellation, member transcript, attendance and inventory receipt access,
  suspended-account rejection and logout revocation.
- Avatar prepare/upload/commit/profile refresh and wrong-owner ticket denial;
  anonymous and member-category restrictions; real private avatar/ID/import
  public-access denial and signed reads; public cover reads. Only generated small
  images and a synthetic workbook were used. All generated objects were deleted
  and absence verified using Storage search.

Synthetic database rows were rolled back and their absence verified. PostgreSQL
sequence allocations can leave harmless gaps. No patron records, biometric data,
passwords or signed URLs were returned. The diagnostic deployment was removed.

Earlier candidate failures were confined to the test harness: production HTTPS
middleware expects the proxy's `X-Forwarded-Proto: https`, which the internal
TestClient initially omitted. The corrected harness supplies it and passed an
isolated HTTPS-middleware regression before the successful cloud run. Production
HTTPS settings and application source were unchanged. The focused operational
suite passed **76 tests**; disposable PostgreSQL checks covered successful workflows
and deliberate permission failure with rollback. Existing dependency deprecation
warnings remain. Temporary containers were removed; no new image download was needed.

The separately built clean release was hashed against immutable GitHub main source
`03525120ad49e862ec84dfc70fc518fa34d0333f`; main was rechecked before promotion.
It contains no diagnostic scripts/routes and preserves the original API deployment
configuration. Health and unauthorized-access checks passed before promotion.

| Deployment | Recorded ID |
| --- | --- |
| New production API | `dpl_5m5XgzvhJfnf6NoHZDctWp7HXCHM` |
| Previous healthy API, retained for rollback | `dpl_8gmqdS2rSyRWC1QZ5WksRBJPD1a3` |
| Unchanged frontend | `dpl_HUYUMetQZr5tYVRiJ4CtqMqjZzbN` |

After promotion, both public API and website rewrite paths passed health (200,
database connected), anonymous profile/librarian-stat denial (401), and diagnostic
route absence (404). A follow-up metadata check confirmed the expected API target,
unchanged frontend target and unchanged configured environment metadata. Supabase's
security advisor returned no lints before promotion; this is not a complete security
assessment. Browser UI and real-camera acceptance were not rerun for this connection
change. PAD and Redis activation were untouched.

Recovery is connection-only: restore the recorded previous API deployment and
remove only the new Production `DATABASE_URL` override, preserving the Preview
candidate. Confirm service recovery before disabling the runtime login. No data
restore is required, and new library transactions must not be overwritten.

Old owner-capable integration credentials, including `POSTGRES_URL`, still exist
in the API environment and old deployments. Consumer review and separate retirement
remain necessary; this release does not claim complete credential isolation.
No application source changes, commit or push were needed for this switch.
Operational test tools and these documentation updates were prepared in the
`restricted-db-account` worktree and are included in the subsequent
[repository handoff](COMPLETED_WORK_HANDOFF_2026-10-25.md).

### Subsequent owner-variable cleanup

The operator authorized continuing with owner-credential retirement. All seven
`POSTGRES_*` variables have since been removed and clean API
`dpl_3NwB7oo7JWNqLs9tW6UQ5yzETckn` promoted on the same main source, preserving
Storage and all other environment settings. Fresh protected cloud and public
health/access checks passed. The operator subsequently confirmed resetting the old
owner password; post-reset checks passed and integration-recreated owner variables
were removed again. See the [current consumer review and retirement record](OWNER_CREDENTIAL_RETIREMENT.md).
The connection-only rollback procedure above describes the first switch and is
historical; prefer the new clean runtime when recovering from future incidents.
