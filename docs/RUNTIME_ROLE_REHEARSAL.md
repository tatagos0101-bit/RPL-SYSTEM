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

If restricting the current 14-table API before the repair release is preferred,
prepare and rehearse an explicit baseline-only candidate separately. The 14-table
preparation at `8975023` is a reference, not evidence that a new live login/pooler
combination has passed. Do not advance the whole repair branch merely to obtain
the runtime-role change. Live cutover remains pending; this pass verifies the
finding and strengthens/rehearses the necessary checks.

References: [PostgreSQL privilege and role-information functions](https://www.postgresql.org/docs/17/functions-info.html),
[read-only transactions](https://www.postgresql.org/docs/17/sql-set-transaction.html),
and [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres).
