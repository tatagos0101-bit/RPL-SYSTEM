# Contact verification and recovery

Implementation prepared November 7, 2026; this document does not establish a live rollout.
FastAPI still owns accounts, passwords and sessions. Supabase Auth is not used.
Login accepts email or RPL Member ID with the existing password. Phone numbers are
editable contact information only; they cannot verify an account or receive reset codes. Existing contacts are not
retroactively marked verified and accounts without a phone are not locked out.

## User flow

- Members use Profile; librarians use Settings → Contact information.
- Email edits require the current password, reject conflicting identities, clear
  email verification and invalidate outstanding codes. Phone edits do not affect
  email ownership or email codes. Existing phone-verification columns are retained
  for compatibility but have no authentication authority.
- A current password is required to request an email verification code. Enter the
  six-digit code to confirm ownership.
- Forgot Password accepts email or RPL ID and sends only to verified email.
  Responses do not identify whether an account exists. SMS requests and old SMS
  codes are rejected server-side.
- Reset success revokes all previous sessions and codes. Sign in with the new
  password. Librarian-assisted recovery remains available for inaccessible email.

## Safeguards

`password_reset_codes` now stores a purpose, HMAC-bound contact/password context,
attempt count and provider-acceptance timestamp. No plaintext OTP is stored.
Verification and reset codes cannot substitute for each other. Codes expire after
15 minutes; replacement invalidates previous codes of the same purpose. Five
failed attempts consume a code. Sends are serialized under an account row lock,
with at least 60 seconds between sends and at most five per hour across purposes.
Existing IP rate limits also apply; production shared Redis remains recommended.

Changed email/password, deleted/suspended accounts, unavailable providers and
expired/used codes fail closed. Changing the email clears verification and
invalidates outstanding codes. New contact verification does not grant a session.
Codes and provider responses must never be logged. Public recovery runs delivery
after the generic response using a fresh database session; this is not a durable
job queue. A process failure can lose delivery; the user can retry after cooldown.
Provider acceptance is not proof that a message reached the inbox.

## Configuration and rollout

Resend is selected using the existing SMTP transport, following its
[setup instructions](https://resend.com/setup.md) and
[SMTP guide](https://resend.com/docs/send-with-smtp).
No new mail SDK or authentication provider is required.

Use [backend/.env.example](../backend/.env.example); actual secrets belong only in
the API service environment, never in `VITE_*`, frontend settings, logs or Git:

| Setting | Value |
| --- | --- |
| `OTP_SMTP_HOST` | `smtp.resend.com` |
| `OTP_SMTP_PORT` | `587` (mandatory STARTTLS) |
| `OTP_SMTP_USER` | `resend` |
| `OTP_SMTP_PASSWORD` | Resend **sending-only** API key; scope to the verified domain when available |
| `OTP_EMAIL_FROM` | `Rizal Provincial Library <noreply@mail.your-domain.example>` (replace with a verified sender) |

Blank password/sender settings disable delivery. The transport uses a unique
`Resend-Idempotency-Key` per send attempt and reuses it for up to two bounded
retries with backoff after transient SMTP/network failures. It does not retry
permanent SMTP rejection, authentication errors or TLS failures. Provider acceptance
is not inbox delivery; an exhausted/failed attempt invalidates its local code.

### Account setup and remaining rollout steps

1. Connect the official Resend MCP at `https://mcp.resend.com/mcp` through OAuth.
   Setup permissions stay with the agent connection; the app receives only a
   sending-only key through a private secret-setting flow.
2. Obtain a domain controlled by the library and select a sending subdomain/sender.
   Add the domain in Resend, review the returned DNS records, and obtain approval
   before changing DNS. Verify SPF/DKIM and configure DMARC appropriately.
3. Until a domain is verified, `onboarding@resend.dev` is for restricted testing
   to the Resend account owner's email or Resend test addresses, not patrons.
   A Vercel project URL is not a domain whose mail DNS the library controls.
4. Configure the API secret and sender privately, then test verification and reset
   through the app using explicitly approved test recipients. Check delivery in
   Resend and repeat a send with the same idempotency key to verify deduplication.
   Do not include OTPs, credentials or recipient data in logs/reports.

Resend confirmed `mail.rizalprovinciallibrary.website` verified with sending enabled
on November 7, 2026. Runtime sending credentials, production settings and actual
inbox-delivery checks must be verified separately before claiming delivery works.
OAuth authorization alone does not configure the application or prove delivery.
Do not automatically provision a paid domain, change billing or deploy.

Before API rollout, apply [contact_verification.sql](../supabase/operations/contact_verification.sql)
in one explicitly authorized database transaction after backup/isolated rehearsal.
It adds four columns to the existing table, keeps RLS and denies browser-role
access. It does not grant runtime privileges or rotate credentials. Old outstanding
codes lack the new context and are deliberately rejected. Local `backend/migrate.py`
also performs the additive upgrade, but runs other existing backfills too. Keep
production `AUTO_MIGRATE=false`. Deploy API before the frontend session-check change.

Tests: `test_contact_verification.py`, `test_password_recovery.py`,
`test_auth_sessions.py`, `test_otp_postgres.py` and `test_loading_paths.py`.
The PostgreSQL test requires `OTP_TEST_DATABASE_URL` pointing to an **empty**
localhost database named `rpl_otp_test`; it creates/drops only disposable test tables.
Mocked transport tests establish application behavior, not real delivery.

This is contact verification/password recovery, not administrator MFA. Biometric
consent/retention decisions and overdue-message delivery are separate work.

Provider references: [Python SMTP](https://docs.python.org/3/library/smtplib.html),
[Resend SMTP](https://resend.com/docs/send-with-smtp).
