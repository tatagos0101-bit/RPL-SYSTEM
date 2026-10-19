# Runtime database-role audit and rehearsal — October 19, 2026

## Production finding

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

Steps 1–6 above describe the pending cloud rollout; the new LOGIN, pooler test,
production candidate, credential handoff and alias change have **not** occurred.
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
Supabase administration access remained unavailable to this session after the user
reported connection; see the [current status/counts](IMPLEMENTATION_STATUS.md).

References: [PostgreSQL privilege and role-information functions](https://www.postgresql.org/docs/17/functions-info.html),
[read-only transactions](https://www.postgresql.org/docs/17/sql-set-transaction.html),
and [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres).
