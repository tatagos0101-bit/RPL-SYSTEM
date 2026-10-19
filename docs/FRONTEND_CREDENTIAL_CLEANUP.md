# Frontend credential cleanup — October 19, 2026

## Scope and consumer inventory

The candidate is based on deployed source `8975023`, with only a frontend build
environment guard and documentation added. Pending repair migrations, Redis
production activation, and the independent PAD work are outside this candidate.

Source/configuration inspection found:

- Browser requests use the shared Axios client and same-origin FastAPI proxy.
  The only application environment inputs are `VITE_API_URL` and Vite's `DEV` flag.
- Vite loads only `VITE_*` configuration. There is no browser Supabase client,
  direct database access, frontend server function, or frontend middleware consumer.
- Both Vercel configurations build static `frontend/dist`; `/api`, `/uploads`, and
  `/health` rewrite to the separately deployed API. API cookies and private Storage
  authorization remain owned by FastAPI.
- The existing artifact scanner can compare available server environment values,
  but that diagnostic capability is not a reason to inject production credentials
  into the frontend build. Signature-based scanning remains after removal.
- Read-only Vercel metadata confirmed 16 Supabase/PostgreSQL variables on frontend
  Production and none on frontend Preview. The Supabase resource has separate
  Production connections to `rpl-system` and `rpl-system-api`. The API has its own
  authentication/storage/database settings; Redis is connected to API Preview only.
  No credential values were decrypted or saved for this inventory.

The 16 frontend variable names are `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`,
`POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_DATABASE`,
`POSTGRES_PRISMA_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Build guard

Every Vite build, including custom modes, rejects known database, Supabase,
authentication and Redis settings inherited from its environment, as well as
matching `VITE_*` settings loaded from frontend environment files. Empty matching
entries are rejected too. Errors contain variable names only. Ordinary platform
build variables and public `VITE_API_URL` remain allowed. Development serving is
unchanged; plain server-only values in local dotenv files are not loaded by Vite.

This is a guard for known configuration families, not a universal secret detector.
The existing post-build artifact scanner remains required. Do not rename or encode
server secrets to bypass either check, or pull them locally for validation.

## Release sequence and recovery

1. Build/test the isolated candidate without application credentials, then verify
   a protected frontend Preview, its nested routes, headers and API rewrite.
2. Disconnect only `supabase-rizal-library` from `rpl-system`, using the
   [project-specific disconnect command](https://vercel.com/docs/cli/integration#vercel-integration-resource-disconnect).
   The API resource connection must remain. Do not delete the resource, disconnect
   all projects, or rotate shared credentials as part of this step.
3. Verify frontend project metadata has no database/storage variables; verify the
   API connection and its configuration metadata are unchanged.
4. Build a production frontend candidate without moving the live domain, inspect
   the successful build/guard and routing, then promote only that frontend candidate.
   Keep the previous static deployment available for recovery.
5. Recheck both public health routes, anonymous protected-route rejection, frontend
   pages/headers and build artifacts. Do not claim authenticated mutation coverage
   unless separately exercised with authorized synthetic accounts.

Disconnecting the project removes future injection; it does not erase credentials
from historical deployment environments or revoke previously issued credentials.
Provider rotation/Sensitive conversion remains a separate consumer-aware operation.
If necessary, restore the previous static frontend deployment while investigating;
the independent API and Supabase resource remain available. Reconnection is only
needed if a real frontend consumer is discovered, and must be reviewed against the
build guard rather than silently weakening it.

Release evidence will be appended after the cloud checks complete.
