# Shared Redis staging — October 18–19, 2026

Shared Redis is **not enabled in production**. The code already supports it; this
pass verified the Vercel address boundary and provisioned/tested staging. The repair
branch now paces requests for the user's two entrance stations and backs off on
failures. Server rate thresholds, dependencies, database schema and PAD are unchanged.

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

These initial minimal previews used the real limiter and matching error-response
behavior, not the full library application. The first rewrite test used two
deployments of the API project. The subsequent cross-project and application tests
below extend that evidence without claiming physical-library acceptance.

## Cross-project and application acceptance

- A temporary API preview and a separate preview on the actual `rpl-system`
  frontend project used the repository's external rewrite rules, pointed at the
  temporary API. Preview protection stayed enabled; its bypass cookie was held
  only in the diagnostic process. The frontend preview contained a static probe
  page, not the complete library UI or any production credentials.
- Direct and frontend-proxied requests from this computer produced the same HMAC
  bucket. Eight concurrent requests split between those paths accepted seven and
  rejected one. Spoofed forwarding headers still returned 429, a different route
  worked, and an invalid Redis credential returned 503 before a subsequent healthy
  route returned 200. Both previews were removed. Initial cookie bootstrap attempts
  stopped on Vercel's 307 redirect; the corrected runner handled that redirect's
  cookie without weakening project protection.
- Two opt-in tests exercised the real application login and kiosk routes against
  staging Redis over authenticated TLS, with isolated SQLite records and a synthetic
  kiosk processing stub. A local TCP relay closed only this test client's connections
  and then restored them; it did not stop or reconfigure the managed service.
  TLS still verified the provider hostname and certificate through the byte relay.
- During connection loss, login returned generic 503 with no new session/cookie;
  kiosk face/log requests returned 503 before face processing. After reconnection,
  those routes recovered and previous counters remained in force. The real 120/minute
  face and 60/minute log caps were exercised to 429 using one peer address. Kiosk
  requests issued no login tokens. Random counter prefixes expired naturally; no
  flush/reset, production database access or real biometric data was used.
- The user confirmed **two entrance stations** behind the library connection. Scans
  now run at most about 40/minute per station (1.5-second interval), leaving headroom
  below the shared 120/minute cap. Event-driven log refreshes are spaced at least
  2.5 seconds apart and coalesced while pending, for at most about 48/minute combined
  versus the 60/minute cap. The normal 10-second log refresh remains.
- Scan and automatic log failures honor valid `Retry-After` seconds/HTTP dates.
  Without a usable header, 429 waits 60 seconds and other failures wait five seconds.
  Scanner restart cannot clear an active cooldown or permit overlapping requests.
  Structured error details render as text; a rejected station PIN still locks the UI.

These are synthetic transport, routing and browser acceptance checks. They do not
measure real camera recognition, PAD, the library's actual network, provider-wide
outages, regional failover, or sustained production cost/availability.

Final local verification on October 19:

- Two Edge contexts with synthetic camera feeds and intercepted API responses
  produced **78 scans and 38 log requests combined in 60 seconds**, below the
  unchanged shared caps. Only one face request and one log request per station
  were pending at a time, including during slow log responses and scanner restart.
- Browser interaction checks covered PIN unlock, structured 503 rendering,
  automatic recovery, retry cooldown, 429 `Retry-After`, and rejected-PIN re-locking.
  Page identity, meaningful content, absence of framework overlays, and desktop
  1440×900/mobile 390×844 layouts passed. Screenshots were inspected; there were
  no application runtime errors, only expected HTTP errors from injected failures.
  The Browser plugin was unavailable, so the existing Playwright/Edge setup was used.
- Backend suite: 199 passed, four skipped (two explicit PostgreSQL tests and the
  two opt-in managed Redis acceptance tests). Both managed Redis tests passed
  separately through the isolated acceptance wrapper on October 18. Existing
  backend deprecation warnings remain. Staging-tool guards: three passed with
  six subtests, including credential isolation and refusal to count skipped tests
  as acceptance success.
- All 64 frontend API-helper tests, lint, production build and build credential
  scan passed. One native build-tool attempt crashed; a separate clean rerun passed.
- Production metadata rechecked October 19: both projects remain READY on
  `897502349ae16f52209bc2d533566d2e08d3f2d1`. Redis variables remain API Preview
  only, with none on the frontend or in production. No live cutover occurred.

The platform [request-header contract](https://vercel.com/docs/headers/request-headers)
documents forwarding-header replacement. The probe above checks the Python adapter
in addition to that documented contract. Keep the ASGI-peer key function; no switch
to trusting arbitrary request headers is warranted by these results.

## Prepared provider preflight

[check_redis_staging.py](../scripts/check_redis_staging.py) is opt-in and requires an
explicit staging hostname. It takes the URI through a hidden interactive prompt or
the dedicated `RPL_REDIS_STAGING_URI` environment variable. It does not use
`RATE_LIMIT_STORAGE_URI`, read `.env`, migrate, or flush a Redis database. The default
preflight does not import the application/database; opt-in acceptance imports the
application with isolated test database fixtures. A fresh child environment excludes inherited application
credentials. The exact hostname guard prevents accidental target mismatch, but
cannot itself prove that an operator-selected service is staging.

From the repository root, using the backend Python environment:

```powershell
uv run --project backend python scripts/check_redis_staging.py --staging-host HOST_FROM_STAGING_PROVIDER
```

For real application routes with synthetic SQLite records and a controlled
client-transport interruption (requires pytest):

```powershell
uv run --project backend --with pytest python scripts/check_redis_staging.py --acceptance --staging-host HOST_FROM_STAGING_PROVIDER
```

Acceptance is skipped during ordinary backend tests. Use this wrapper for live
staging checks: it captures diagnostics, withholds connection details, and requires
both acceptance tests to pass rather than accepting a skipped run as success.

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
3. Cross-project routing, application transport loss/recovery, and synthetic shared-IP
   kiosk quota checks above passed. Confirm real-library latency/workload with two
   stations and assess provider quota/outage recovery before cutover; synthetic tests
   do not establish real-library or provider-wide availability. PAD stays separate.
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
