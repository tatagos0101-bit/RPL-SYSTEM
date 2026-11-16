# Member registration verification

Completed locally November 16, 2026. User requested optional government ID, shorter
temporary registration passwords, email-first delivery, phone-only text delivery
and librarian handoff without contact information. This is not a production
release or proof of live email/SMS delivery.

## Implemented

Both librarian registration entry points (Dashboard and Members) accept no ID.
Supplied ID files/tickets still use existing private Storage, content/type/size
and owner/category validation. The ID column was already nullable; no schema
migration or dependency change was required.

Registration alone creates a cryptographically random 10-character mixed-case/digit
password and retains the existing password policy and forced first-login change.
Librarian password resets retain their 14-character default and session revocation.
The member is committed before delivery. Email is preferred whenever supplied;
SMS is attempted only without email and with a phone. Missing contacts or
unavailable/unconfirmed provider acceptance use the same password for librarian
handoff. Accepted sends return no plaintext password in the registration JSON.
Passwords are not persisted as plaintext or placed in browser storage/logs.

A generic email-send function reuses existing SMTP configuration, STARTTLS and
sanitized errors. OTP sends retain their existing retries/idempotency behavior;
registration uses one attempt. The registration-only Twilio adapter has separate
blank-by-default server settings, a fixed HTTPS endpoint, validated acceptance,
normalized phone numbers, bounded timeout and no retry/redirect. Public SMS OTP,
verification and recovery remain disabled. Sending never marks contacts verified.
Both existing modals show the delivery result, preserve their layouts/theme,
block dismissal while a request is pending and explain unknown responses without
encouraging duplicate creation. Existing upload preparation is skipped only when
no file is attached. Registration's client timeout is 90 seconds.

## Checks actually run

- `git status --short`: unavailable because the downloaded archive has no `.git`.
  Scoped pre-change source copies/hashes were saved under
  `.tools/member-registration/baseline/`; existing changes were preserved.
- Backend red/green checks demonstrated the old no-ID rejection and 14-character
  registration password, then the missing accepted-send/email-validation behavior.
  Final targeted regression: **110 passed, 0 failed**, 13 existing deprecation
  warnings. This included registration, sessions, repair authorization, recovery,
  contact verification, OTP transport, cloud integration, member deletion and
  member lookup; this was not a full backend-suite rerun.
- **33 new backend cases** cover optional ID/short credentials, valid attached ID,
  no-storage-without-upload, invalid ticket, valid/invalid email, post-commit send,
  commit/conflict failure without send, no-contact forced change, role/status
  restrictions, email precedence, provider unavailability, TLS, SMS normalization,
  acceptance/rejection, uncertain-send no retry and sanitized failures.
- Default backend test fixtures explicitly disable inherited live delivery.
  Registration email fixtures were changed from reserved `.test` addresses to
  synthetic `example.com` values so they exercise the installed production email
  validator. No fixture message was sent. An initial diagnostic import error in
  the post-commit test was corrected to use the existing test SessionLocal binding.
- Full frontend helper suite: **95 passed, 0 failed**, including six new focused
  cases for FormData, optional attachments, sent/manual results, legacy responses
  and unknown-response wording.
- Scoped ESLint passed for all **six** changed/new JS/JSX/test files.
- Final production build passed, including its credential scan (**78 files**).
- AST comparisons preserved **49 frontend functions** outside the requested
  registration changes, including the entire Members page business/render function
  and password-reset modal, plus other librarian API helpers. **30 backend functions**
  outside register_member matched their baseline AST, including reset behavior.
  **Nine protected file hashes** matched for models/password policy, upload/ticket
  helpers, modal frame and dependency manifests. **38 saved files** from the previous
  workflow revision remained identical; only this task's intended librarian route/API
  helper changed from that earlier final-source set.
- A fresh builder check found no important unanswered questions. Final fresh source
  review found no material findings. The reviewer did not rerun tests or verify live
  providers. No product source changed after that review.

## Rendered browser verification

The Browser plugin/skill was not available in this session; the existing installed
Playwright/Chrome setup was used. All API and provider-dependent registration
responses were intercepted using synthetic fixtures. No real account, upload,
recipient or biometric was accessed. The localhost app was at
`http://localhost:5173`, checked at desktop 1536x1000, mobile 390x1000 and mobile
result views at 390x844.

The baseline Dashboard form blocked a no-ID submission with the required-ID error.
Final browser checks passed **24 grouped cases**:

- Dashboard and Members: no-ID registration submits; manual/email/SMS/unavailable/
  unconfirmed outcomes show accurate results. Accepted sends show no temporary
  password; manual/failure handoffs show the original synthetic value. Email/phone
  form values and absent attachment fields are correct.
- Both pending registration states keep the modal open on Escape, disable Close
  and submit one request. Optional attachments still use category `ids` through
  the existing preparation route.
- An unknown network response tells the librarian to check the member list before
  registering again. No automatic retry was introduced.
- Both forms remain within mobile page/dialog width in dark and light themes.
  Both accepted/manual mobile result views have a reachable Done action.
- Correct page identity, meaningful content, no Vite error overlay and no page
  runtime errors/unexpected API calls were verified. Synthetic screenshots were
  inspected for status clarity, optional ID labeling, contrast and mobile controls;
  retained under `.tools/member-registration/art/`.

## Local runtime, configuration and limits

Before restarting, settings were checked without exposing values: exact isolated
SQLite file `backend/rizal_library.local.db`, development environment, local
uploads and `AUTO_MIGRATE=false`; encryption/config checks passed. Only the saved
owned backend process was stopped/restarted after matching its executable and
start time. The existing frontend remained running. The first two-second startup
probe timed out; subsequent longer probes confirmed HTTP 200 for localhost API
health and the frontend. No schema upgrade, runtime account write or real-message
send was performed.

Both local email and registration SMS transports were **unconfigured**, checked
by presence only. In this state registration falls back to the librarian even
when a contact is supplied, with an explicit unavailable message. Actual sending
requires private SMTP and/or Twilio server credentials plus an authorized sender
and approved-recipient delivery checks. See
[setup and limitations](../../CONTACT_VERIFICATION.md#new-member-registration-credentials).
No paid account/resources, production settings, deployment, commit or push were
created. Provider acceptance is not proof of inbox/handset delivery; no carrier
webhooks, durable send queue or registration resend endpoint were added. Live
PostgreSQL/Storage/provider and physical-camera acceptance were not established by
these local mocked checks. Temporary QA is removed where Windows permissions allow;
source baselines, final result/source hashes and screenshots are retained.
