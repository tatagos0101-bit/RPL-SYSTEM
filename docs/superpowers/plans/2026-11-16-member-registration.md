# Member registration implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Required builder spec check and one fresh final review; no implementation delegation.

**Goal:** Optional government ID and email-first, SMS-second, librarian fallback for shorter temporary registration passwords.

**Architecture:** Existing FastAPI register route and private upload validation; shared SMTP transport and registration-only SMS adapter. Existing React forms consume a small shared result component. No schema or dependency changes.

**Tech Stack:** React/JSX, FastAPI, SQLAlchemy, SMTP, existing httpx.

**Spec:** [Design](../specs/2026-11-16-member-registration-design.md)

## Constraints and review focus

- Preserve prior workspace changes, auth/session/PAD/OTP policy, acquisition/circulation and all unrelated member functions.
- Unverified contact remains unverified. ID omission must not bypass validation of an attached file/ticket.
- Provider acceptance must be real (mocked in tests), failed delivery must not report success, and an unknown response must not encourage duplicate registration.
- Keep plaintext credentials out of persistence/logs and accepted registration responses. Both forms must handle missing temporary_password.
- Sending runs only after a successful commit; both fallback and sent credentials remain usable with forced change. No retry after uncertain SMS sends.

### Task 1: Backend and delivery

- [x] Save source baselines, complete source-grounded design and required builder check.
- [x] Add failing isolated API tests for no-ID registration and 10-character handoff; demonstrate the existing 422/14-character failure.
- [x] Implement optional upload branch and new-member-only password length, preserving explicit upload validation.
- [x] Add failing transport/routing tests for email precedence, SMS/no-contact, acceptance/failure, post-commit send and hidden sent password.
- [x] Implement shared email-send extraction with unchanged OTP behavior; add registration delivery service and response status. Add server-only SMS settings to example configuration.
- [x] Run relevant authentication, upload, member, contact verification and transport regressions.

### Task 2: Both registration forms

- [x] Add helper tests and baseline synthetic browser assertions for optional ID and delivery outcomes.
- [x] Add a focused shared delivery-result helper/component, make absent ID optional in validation/FormData/labels and update explanatory copy in both existing modals.
- [x] Preserve structures/theme/other handlers; extend only registration timeout and network-unknown wording.
- [x] Verify both entry points, pending submission, attachments, delivery states, mobile and light/dark with mocked APIs only.

### Task 3: Final checks and local handoff

- [x] Run scoped ESLint, full frontend helper suite, appropriate backend regressions and final production build/credential scan.
- [x] Complete fresh source review, resolve material findings, confirm protected-file hashes and inspect synthetic screenshots.
- [x] Update architecture/setup/contact notes and actual verification ledger; remove disposable QA safely.
- [x] Restart only the owned local backend after checking isolated configuration with AUTO_MIGRATE=false; confirm frontend/API health and leave both running. No real messages or account writes in the runtime database.

Completed locally November 16, 2026. See [verification](../specs/2026-11-16-member-registration-verification.md) for actual results and provider configuration limits.
