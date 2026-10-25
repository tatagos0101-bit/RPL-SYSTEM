# Browser content policy — October 25, 2026

Security follow-up 14 adds explicit resource restrictions to both frontend
Vercel configurations. Application source, dependencies, database schema, PAD
and Redis configuration are unchanged. The API/upload/health proxy exclusions
are preserved. This policy is enforced, rather than report-only.

## Scope

- Deny unspecified resources; permit same-origin scripts without inline script
  or evaluation exceptions. Deny inline event handlers, frames, objects and workers.
- Permit connections only to self, `rpl-system-api.vercel.app`, the existing
  `quzhxkgkdrctiosyjxcr.supabase.co` Storage host, `www.googleapis.com` and
  `openlibrary.org`, using HTTPS for the external hosts.
- Preserve inline styles, HTTP/HTTPS external cover images, data/blob images,
  local fonts and same-origin/blob media. Preserve print popups and blob downloads.
- Keep forms/base URLs same-origin and deny framing by other sites.
- Keep the API origin synchronized when `scripts/configure_vercel.py` changes
  the proxy. Reject URL input capable of injecting policy directives.

Inline styles and broad image sources are intentional compatibility exceptions.
The policy does not replace server authorization, upload validation or escaping;
it does not prevent every possible same-origin injection or image-based leak.
Adding a worker, third-party script, new Storage project or browser connection
requires explicit review of both policy copies. No CSP report collector is added.

## Acceptance

- Production Vite build and bundled credential check passed.
- 21 focused configuration/deployment tests passed, with existing dependency
  deprecation warnings. No application-wide backend retest was needed for headers.
- Playwright 1.63.0 with headless Microsoft Edge exercised the actual built SPA
  behind the proposed HTTP headers at desktop 1440×1000 and mobile 390×844.
  Browser plugin not available; the existing Playwright installation was used.
- Synthetic API fixtures verified member login, direct Supabase upload, avatar
  update/reload, Google Books and Open Library fallback, blob cover preview,
  CSV parsing through the workbook library, camera capture/retake/enrollment,
  CSV/PDF downloads and styled report printing.
- Supported flows had no unexpected API calls, application errors or CSP
  violations. Negative probes verified blocking of injected inline scripts,
  inline handlers, external scripts, evaluation and unknown connection origins.
- Desktop/mobile catalog and print screenshots were inspected. All records and
  images were synthetic; webcam frames came from Chromium's fake media device.

These are browser-compatibility checks, not a new database/Storage integration
test or PAD accuracy certification. Browser scripts/screenshots remain outside
the repository. Local acceptance is complete; cloud edge/release verification
is recorded separately after deployment.
