# Shared Redis staging — October 18, 2026

Shared Redis is **not enabled in production**. The code already supports it; this
pass verified the Vercel address boundary and provisioned/tested staging. No
application routes, rate thresholds, dependencies, database schema or PAD changed.

## Checks completed

- Vercel team integration inventory lists one installation. The API project's
  connected resource is `supabase-rizal-library` (Supabase), shared with the frontend.
  No Redis integration was found in this connected inventory. This cannot exclude
  an unrelated provider account or a service outside this team.
- Two temporary FastAPI previews were deployed on the existing API project in
  `sin1`, using an allowlisted minimal source set, production-matching FastAPI,
  Starlette and SlowAPI versions, and the exact `client_limit_key` function extracted
  from repository source. They had no database/storage application code or production
  credentials. The project had no preview environment entries at inspection.
- Probe access required a random temporary bearer token, preview environment and
  a one-hour expiry. Responses exposed only a temporary HMAC bucket and address
  classifications/comparison booleans; raw addresses and headers were not recorded.
- The ASGI peer was a public address and matched Vercel's forwarded-address headers.
  Supplying synthetic `X-Forwarded-For`, `X-Real-IP`, `X-Vercel-Forwarded-For` or
  `Forwarded` headers did not change the bucket. A repeat baseline stayed stable.
- A controlled outbound request from the preview to its own fixed deployment URL
  produced a different bucket from this computer's requests. Both addresses were
  classified public. This verifies two network sources on this direct API preview,
  not two library users behind the same NAT or the frontend's cross-project rewrite.
- Both temporary previews were removed. Production targets were rechecked afterward:
  frontend and API remain READY on `897502349ae16f52209bc2d533566d2e08d3f2d1`,
  with no project `RATE_LIMIT_STORAGE_URI` variable. The 12 repairs remain undeployed.
- Existing disposable PostgreSQL 17/Redis 8 integration checks passed, including
  exactly seven accepted requests across two limiter instances under concurrency,
  client/route separation, and connection-failure rejection. Its containers/network
  were removed successfully. PostgreSQL and circulation checks also passed.
- All 10 focused backend rate-limit regressions passed, including generic 503,
  no session creation on Redis failure, credential-safe errors and TLS configuration.
  Existing deprecation warnings remain. Two staging-tool guard tests passed.
- After provisioning the managed service, two additional minimal Vercel previews
  ran the unchanged repository limiter against the same staging Redis. Eight
  requests split across the deployments accepted exactly seven and rejected one
  with 429. Spoofed forwarding headers still returned 429; a separate route and
  a Vercel-originated client request remained usable. An external rewrite between
  these previews also returned 429 for the exhausted direct-client bucket.
- A deliberately invalid Redis credential returned the generic application-style
  503 without executing the synthetic operation. A healthy-credential route then
  succeeded. This tests a client credential failure, not a real provider outage or
  recovery after disabling the whole service. Both previews were removed. The first
  two attempts stopped on Windows diagnostic-output parsing; that runner issue was
  corrected before the successful run, and their temporary previews were removed.

These minimal previews used the real limiter and matching error-response behavior,
not the full library application. The rewrite test used two deployments of the API
project; acceptance on the actual separate frontend project and library kiosk
traffic remains a release requirement.

The platform [request-header contract](https://vercel.com/docs/headers/request-headers)
documents forwarding-header replacement. The probe above checks the Python adapter
in addition to that documented contract. Keep the ASGI-peer key function; no switch
to trusting arbitrary request headers is warranted by these results.

## Prepared provider preflight

[check_redis_staging.py](../scripts/check_redis_staging.py) is opt-in and requires an
explicit staging hostname. It takes the URI through a hidden interactive prompt or
the dedicated `RPL_REDIS_STAGING_URI` environment variable. It does not use
`RATE_LIMIT_STORAGE_URI`, read `.env`, import the application/database, migrate, or
flush a Redis database. A fresh child environment excludes inherited application
credentials. The exact hostname guard prevents accidental target mismatch, but
cannot itself prove that an operator-selected service is staging.

From the repository root, using the backend Python environment:

```powershell
uv run --project backend python scripts/check_redis_staging.py --staging-host HOST_FROM_STAGING_PROVIDER
```

Do not put a connection URI in shell arguments, chat or committed files. The checker
uses the existing limiter's production TLS/authentication validation and two clients
to exercise the provider's atomic counter/Lua behavior, independent client/route
keys and expiry. It writes only randomly namespaced synthetic counters, which expire
within approximately a minute. It does not simulate a managed-provider outage or
certify service availability. Errors withhold connection details.

The tool's secret-isolation/target guards and missing-credential refusal were tested.
After the user accepted the provider terms, the managed-provider preflight passed
against the dedicated staging service: authenticated TLS, shared atomic counters,
client/route separation and synthetic-key expiry. Only the newly created staging
URI was retrieved into process memory; it was neither displayed nor saved to disk.
The successful disposable integration run uses local Redis and is separate evidence.

## Provisioned staging configuration

Created Upstash Redis through Vercel Marketplace: `rpl-rate-limit-staging`, connected
to **API preview only**, in `sin1`. Provider metadata confirms plan `free`,
`autoUpgrade=false`, `eviction=false`, `prodPack=false` and no extra read regions.
Resource ID: `store_dmt27bAzLby5TivT`. No Redis credentials were connected to the
Vite frontend or to production.

Vercel's product metadata subsequently confirmed plan `free` and region `sin1`.
The initial setup explicitly selected `autoUpgrade=false`, `eviction=false` and
`prodPack=false`, with `--no-connect --no-env-pull`. It stopped before provisioning
with `integration_terms_acceptance_required` and `userActionRequired`: the account
owner had to accept Upstash Marketplace terms in Vercel's browser flow. After the
user reported acceptance, creation succeeded with those same settings. The resource
was then connected explicitly to API preview under prefix `RPL_REDIS_STAGING`.
Do not use the CLI's default connection scope (all built-in environments).

API Preview now has `RATE_LIMIT_STORAGE_URI` as Sensitive and
`RATE_LIMIT_REQUIRE_SHARED=true`. The integration's prefixed variables are encrypted,
not Sensitive; the application URI is a separately managed Sensitive copy. A future
provider credential rotation must also update that copy before redeploying. Production
has neither rate-limit variable, and frontend has no Redis variables. Both production
targets remained READY on `8975023` after staging configuration.

Upstash currently advertises a $0 tier with 500,000 monthly commands; confirm the
Marketplace's offered plan/eligibility. Its listed pay-as-you-go price is $0.20 per
100,000 commands. No paid plan or add-on was selected in this pass.
Free quotas/budget caps can interrupt requests when exhausted, so a free staging
trial is not an availability decision for production. See
[provider pricing](https://upstash.com/pricing/redis) and
[Vercel Redis integrations](https://vercel.com/docs/redis).

## Remaining release requirements

1. Keep staging and production services separate. Upstash REST URL/token variables
   are not substitutes for this application's authenticated `rediss://` TCP URI.
   No new SDK is needed.
2. Use synthetic database/storage targets for a full application preview; do not
   copy production credentials. Keep `AUTO_MIGRATE=false` and apply any candidate
   schema only to isolated test data.
3. Complete actual frontend/API cross-project and legitimate kiosk/NAT acceptance,
   plus controlled provider outage/recovery checks on staging. The direct API,
   two-deployment counter, synthetic external-rewrite and credential-failure checks
   above have passed; they do not establish library traffic/availability behavior.
4. Only after those checks, prepare the production service/region/plan, environment
   changes and exact deployment candidate for release. Coordinate separately with
   [the 12-repair migration rollout](REPAIR_ROLLOUT.md); do not accidentally deploy
   that entire branch as a Redis-only change.

## Recovery requirements

Do not enable `RATE_LIMIT_REQUIRE_SHARED` without a working URI. Do not automatically
fall back to process memory on failure. Retain a verified, healthy Redis target for
recovery and redeploy after credential/endpoint changes; a code rollback alone does
not restore a broken external store. Restoring an older memory-only deployment is
a deliberate reduction in protection requiring an explicit incident decision.
Never clear all Redis keys as a test or rollback step. Existing station PIN and JWT
secrets do not need rotation for this rollout.
