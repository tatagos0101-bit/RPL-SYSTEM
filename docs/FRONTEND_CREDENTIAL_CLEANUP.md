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

## Completed release evidence

On October 19, 2026, the project-specific disconnect succeeded. The frontend has
zero project environment variables, and Supabase resource metadata lists only the
API Production connection. API environment IDs/names/types/targets/update metadata
and the production deployment ID remained unchanged. Credentials were not decrypted,
copied, rotated or individually deleted. Redis remains API Preview only.

The reviewed frontend candidate was built from local commit
`c18c05b08f5f94fc11f121241e4edb47e71a04a3`, based on production `8975023`.
It reached READY as `dpl_Ewjj59uW2f1xc8zJw9pkgbj5va93`, with zero frontend
server functions. Its immutable URL is
`https://rpl-system-mckd5mvrh-tatagos0101-5211.vercel.app`. Vercel's CLI deployment
records the source in `meta.gitCommitSha`, rather than `meta.githubCommitSha`.
After protected-preview/candidate checks, only this frontend deployment was promoted
to `https://rpl-system.vercel.app`. The API remains
`dpl_FpN6P2p7Aq8f1NMnc1ym8xQciM7E` on `8975023`. No repair migrations, API
redeployment, Redis production activation, Git push, or PAD changes occurred.

Checks actually run:

- 60 frontend helper/build-guard/scanner tests passed on the deployed-baseline
  checkout, including an actual custom-mode Vite build refused before asset output
  with a synthetic server credential. Error output did not contain its value.
- Lint, a credential-free local production build, and its 64-file artifact scan
  passed. The cloud production build and artifact scan also passed.
- Protected Preview, production candidate, and live browser checks passed using
  existing Playwright/Edge because the Browser plugin was unavailable. Synthetic
  intercepted data verified catalogue search, member/librarian login forms, and
  a rejected station PIN retaining the lock without opening a camera. Same-origin
  API requests, page identity/content, no framework overlay, desktop 1440×900 and
  mobile 390×844 rendering passed. Screenshots outside the repository were inspected.
  There were no runtime errors; the injected PIN rejection produced the expected 403.
- Real read-only checks returned 200 for homepage/login/station routes and healthy
  `/health` responses through the frontend rewrite and directly from the API.
  Anonymous profile and librarian-stat requests returned 401 on both origins.
- The published app's complete referenced HTML/JS/CSS dependency graph was downloaded
  to temporary storage and scanned: **61 files, zero signature findings**. JavaScript
  and CSS content types were checked to reject SPA-fallback HTML. Frame protection,
  `nosniff`, and CSP passed on `/`, `/user/login`, and `/entry-station`.
- The temporary Preview was removed. The new live deployment and prior static
  production deployment remain available. Backend suites were not rerun because
  this candidate changes no backend source, dependencies or schema.

The first artifact comparison incorrectly assumed Windows/local filenames matched
cloud output; the corrected verifier traversed the actual published dependency graph.
Diagnostic CLI scope placement and Windows log decoding were also corrected before
the successful checks. These were verification-runner failures, not application fixes.

This release does not establish full authenticated production mutation coverage or
prove that arbitrary/unknown secrets are absent. Historical deployment environments
still require the separate provider rotation/Sensitive-conversion plan described above.

The release branch and evidence were merged into `fixing-the-issue` as `f585fcc`
so its future repair deployment retains the guard. On the combined repair branch,
all **74** frontend helper/guard/scanner tests, lint, production build and 69-file
local artifact scan passed. This merge was local; GitHub `main` was not pushed.
The other repair changes and shared Redis remain undeployed.
