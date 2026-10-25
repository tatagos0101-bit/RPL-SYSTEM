# Owner database credential retirement — October 25, 2026

This follows the [restricted runtime switch](RUNTIME_ROLE_REHEARSAL.md). It concerns
the old PostgreSQL owner password and connection variables, not the application JWT,
station PIN, restricted-role password or Storage API key.

## Consumer review

- Current application source at `03525120ad49e862ec84dfc70fc518fa34d0333f` selects
  `DATABASE_URL` before `POSTGRES_URL`. No other `POSTGRES_*` variable is read by
  application code. There is no Prisma consumer or tracked GitHub Actions workflow.
- Vercel's Supabase resource is connected only to API Production. Frontend project
  environment variables remain absent. Redis is a separate Preview connection.
- Supabase has no deployed Edge Functions and no `pg_cron` extension. A point-in-time
  activity check found zero other owner client connections and one restricted runtime
  connection. This does not prove that offline/external consumers do not exist.
- The connected maintenance SQL channel works independently as `postgres`. The user
  is unsure whether other external database tools/jobs exist.
- The ignored local backup tool previously read `.tools/vercel.production.env`.
  It now requires a current maintenance URI through a hidden terminal prompt or
  `RPL_MAINTENANCE_DATABASE_URL`; it never falls back to that historical export.
  Synthetic checks passed session-port conversion, required TLS and rejection of
  missing noninteractive credentials without database access. Existing encrypted
  backups were not changed or deleted. Historical one-off migration scripts must
  be reviewed before reuse; their old credential exports are not current setup.

## Environment cleanup and acceptance

Removed only these API Production entries using their recorded variable IDs:
`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`,
`POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_DATABASE`.
The initial CLI call lacked its DELETE confirmation flag and changed nothing;
the authorized retry succeeded. Every other environment entry's metadata was
unchanged, including restricted `DATABASE_URL`, Storage, JWT/PIN and Preview Redis.
Integration connection metadata also no longer lists any `POSTGRES_*` variable.
The Supabase resource was not disconnected or deleted.

Protected candidate `dpl_GHJowQmrgDRcHx3b3dFuELipEvAs` required owner variables to
be absent in its actual process environment. It passed all 16-table permissions,
restricted pooler identity/TLS, full-API synthetic workflows and real Storage
upload/privacy/signing/cleanup checks. Synthetic rows were rolled back, generated
objects deleted, and the diagnostic deployment removed. No patron data or secret
values were output. Sequence allocations may leave harmless gaps.

Clean API deployment `dpl_3NwB7oo7JWNqLs9tW6UQ5yzETckn` was verified and promoted
using unchanged main source `03525120ad49e862ec84dfc70fc518fa34d0333f`. It contains
no diagnostic routes. Public API and website-rewrite checks passed health (200,
database connected), anonymous profile/librarian-stat denial (401), and diagnostic
route absence (404). The frontend remains `dpl_HUYUMetQZr5tYVRiJ4CtqMqjZzbN`.
The previous restricted release `dpl_5m5XgzvhJfnf6NoHZDctWp7HXCHM` remains available
for emergency rollback but still contains the old owner variables; a clean rebuild
is preferable. Supabase security advisors returned no lints. PAD and Redis remain
unchanged. No new application source commit or push was needed.

Older deployments keep their original environment; removal from project settings
and the new release does not erase credentials from those historical deployments.
The required privileged Storage key is preserved; removing database owner variables
does not make the entire API process free of elevated credentials.

## Final password reset and recovery boundary

The operator confirmed completing the provider's `postgres` password reset and
saving the new password privately on October 25. The new password was not requested,
retrieved, copied or tested through the agent. Invalidation evidence is the operator's
confirmation of the provider reset, not an independent old-password rejection test.
Unknown external tools using the old owner password need a separately updated
maintenance connection. Existing encrypted backup archives remain intact.

The reset caused Vercel's integration to recreate all seven `POSTGRES_*` variables
and refresh metadata for its other nine variables. The live release retained its
clean deployment environment. A guarded second cleanup removed the recreated
entries by ID and verified that all other settings were preserved. Project and
integration connection metadata again contain zero owner variables. This is a
known reinjection risk: repeat this metadata check after future resource resets,
reconnections or integration syncs, and before releasing an API deployment.

Post-reset catalog checks confirmed maintenance access, restricted login enabled
without administrative attributes, and zero other active owner client connections
at that moment. Protected candidate `dpl_79xZCEmhGDaM2QpBcvTePpri8hpe` passed
restricted pooler identity/TLS, all 16-table permissions, synthetic API workflows
and real Storage checks with owner variables absent. Synthetic rows were rolled
back and generated files deleted. The diagnostic deployment was removed; public
API and website-rewrite health/access checks then passed again. Project metadata
matched the cleaned configuration and both live deployment targets were unchanged.
No additional public deployment was needed after the password reset.

Security item 5 is complete within this documented scope. Item 7 remains open for
broader credential handling and API-key lifecycle work. No new unit-suite run was
needed for these operational checks and documentation updates; the existing 76-test
operational suite passed before the release, and this pass exercised the changed
cloud environment directly. Documentation diff checks passed.

Do not redeploy an older owner-only application environment as recovery. Prefer a
verified current-source release using the restricted connection. Local backups
remain encrypted with Windows DPAPI independently of the database password.
Do not rotate JWT, restricted-role or Storage credentials as part of this owner
password reset. The broader credential-handling work remains separate.

References: [Supabase password management](https://supabase.com/docs/guides/database/postgres/roles#changing-your-project-password),
[Vercel integration secret rotation](https://vercel.com/kb/guide/how-to-reset-the-secrets-of-your-supabase-integration).
