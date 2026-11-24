# Contact verification and recovery

Implementation prepared November 7, 2026; this document does not establish a live rollout.
FastAPI still owns accounts, passwords and sessions. Supabase Auth is not used.
Login accepts email or RPL Member ID with the existing password. Phone fields and
SMS sending are removed from registration, profiles and member lookup. Existing
phone values/verification metadata are preserved for compatibility and have no
authentication or delivery authority. Existing contacts are not retroactively
marked verified.

## User flow

- Members use Profile; librarians use Settings → Contact information.
- Email edits require the current password, reject conflicting identities, clear
  email verification and invalidate outstanding codes. Legacy phone fields in
  requests are ignored without altering stored contacts or verification metadata.
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
5 minutes for both password resets and contact verification, including a creation-time
cap on older codes issued with longer expiry; replacement invalidates previous
codes of the same purpose. Five
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

## New-member registration credentials

Local implementation added November 16, 2026. This does not establish a deployed
release or real delivery. ID upload is optional in both librarian registration
forms; supplied documents retain their existing private Storage and ticket rules.
Name/address remain required. No schema migration or new dependency is needed.

Registration generates a random 10-character password that meets the existing
password policy. The account is committed before sending. Email is used when
supplied. Without email, or when email delivery is unavailable/acceptance is
unconfirmed, the authenticated
librarian receives the password to give directly to the member. A successful
provider acceptance returns its channel/status and no plaintext password. The
password is never persisted as plaintext. All new members must change it on first
login by entering and confirming a new password without re-entering the temporary
password. Librarian-created members must also acknowledge the privacy notice
covering account information and service emails before the system saves the new
password. Facial recognition has its own opt-in at enrollment. The authenticated
session authorizes first-login changes. Normal password changes still require the
current password. Temporary passwords expire
after 24 hours, and recovery email codes expire after five minutes. Sending does
not set either contact's verified flag. Existing staff password
resets retain their original 14-character default and session-revocation behavior.

Email uses the same `OTP_SMTP_*` and `OTP_EMAIL_FROM` server settings documented
above, with a separate registration subject/body and Resend idempotency key. It
includes the Member ID and first-login instructions. Registration uses one SMTP
attempt with a 5-second socket timeout; existing OTP retry behavior is unchanged.
The registration request has a 90-second client timeout. A network-unknown response
instructs staff to check the member list before registering again; existing password
reset is available when sign-in details are inaccessible. This is not a durable
message queue and has no registration resend endpoint.

The former Twilio adapter is removed. Legacy SMS configuration cannot enable paid
messages. Phone-only or contactless registration returns the temporary password
only to the authenticated librarian, who gives it directly to the member. Existing
phone data is not erased. Inactivity notices use email or the member's durable
in-account notification; pending legacy SMS notices are changed to in-account
delivery without a provider request. Historical delivery records remain intact.

Email transport follows [Resend SMTP](https://resend.com/docs/send-with-smtp),
including its SMTP idempotency header. The system does not enable SMS
verification or password recovery; those requests and legacy SMS codes remain
rejected. Do not conflate sending initial credentials to staff-entered contact
information with verified contact ownership.

The original local configuration was checked by presence only; it did not establish
production delivery. Transport/browser checks use synthetic data and mocked
providers; they do not establish live inbox acceptance. Configure email credentials
privately and check explicitly approved test recipients before claiming live
sending. See the [local verification](superpowers/specs/2026-11-16-member-registration-verification.md).
