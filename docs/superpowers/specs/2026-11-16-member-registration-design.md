# Member registration and credential handoff

Date: November 16, 2026. Implements the user's direct request on both librarian registration entry points without redesigning them.

## Requirements and decisions

Government ID becomes optional. Name and address remain required; email and phone remain optional. If an ID file or upload ticket is supplied, preserve content/type/size, ticket owner/category checks and private storage. Omitted ID stays NULL; the model already permits this, so no migration is needed.

Registration uses a cryptographically random 10-character mixed-case/digit temporary password, shorter than the existing 14. Keep password validation/hashing, forced first-login password change, session/access checks and reset/recovery behavior. Existing librarian-assisted password resets retain their 14-character default; the shorter value is specific to new registrations.

Commit the member before attempting delivery. Prefer email whenever entered; use SMS only when email is absent; otherwise show the password to the authenticated librarian. Do not mark a contact verified because a provider accepted a message. No SMS password recovery, changed public OTP behavior or alternate auth provider is included.

If the selected provider is unavailable or acceptance cannot be confirmed, return a clear librarian-handoff status with the same password, rather than undoing the committed member, claiming delivery or trying a different contact automatically. Never log passwords, contacts, credentials or provider responses. Do not persist plaintext passwords or a new delivery queue. Successful provider acceptance returns no plaintext temporary password in the registration JSON; the librarian still sees the member ID and delivery outcome. There is no resend endpoint; existing staff reset remains available if needed.

## Approaches

Reuse the configured email SMTP transport and add a separately enabled registration-only SMS adapter. This fits existing FastAPI ownership and requires no dependencies or schema changes. A new account provider, durable messaging queue or public SMS recovery would broaden the task and is excluded. The optional provider question has been asked; the implementation default is Twilio if no different provider is named, disabled until its server credentials are explicitly configured. No paid account/resource is created.

The shared email transport retains mandatory validated STARTTLS, existing OTP retry/idempotency behavior and sanitized failures. Registration mail uses one bounded SMTP attempt (5-second socket timeout); it has its own subject/body and includes member ID, temporary password and first-login instructions. A longer registration-request timeout prevents the existing 30-second client limit from cutting off a normal provider attempt. Delivery runs outside the async event loop via the existing framework thread helper. Unknown registration responses instruct staff to check Members before repeating registration.

SMS uses a fixed HTTPS Twilio Messages endpoint, Basic auth with private account settings, no redirect/retry, a bounded timeout and validated acceptance response. Normalize Philippine local mobile formats to +63 and permit explicit international E.164 numbers. Invalid/non-SMS-format contacts are still stored as contact data but fall back to manual handoff; never send to an invented destination. Provider acceptance is not inbox/handset delivery.

## Response and UI

Existing registration fields remain. Add phone and password_delivery: {channel: email|sms|librarian, status: accepted|unavailable|failed|manual}. temporary_password is null when accepted and contains the generated value for librarian handoff. Both existing forms make ID visibly optional, omit absent files from FormData, show the contact delivery order, and use one small shared delivery-result component/helper to avoid inconsistent success messages. The current theme, modal structures, other member actions and reset modal are preserved. Submission remains disabled while pending; no password is saved in browser storage.

## Verification and boundaries

Focused API tests: optional ID/null storage; valid/invalid/ticket uploads; email precedence with both contacts; phone-only and no-contact handoff; failed/unconfigured provider; short random valid credentials and enforced password change; member committed before send; anonymous/wrong-role/suspended rejection; contacts stay unverified; no plaintext/hash disclosure on accepted sends; malformed email rejected safely. Transport tests mock SMTP/HTTP, cover TLS/auth/no secret logs, correct provider request and failed/rejected/unknown sends. Existing OTP tests must still reject SMS.

Browser checks intercept synthetic responses only: both registration entry points submit without ID, optional attachment still uses current upload path, accepted email/SMS and manual/failure results are accurate, pending submission is disabled, both themes/mobile remain usable and no runtime error is introduced. Run scoped lint, frontend helpers, relevant backend regression suites and build/credential scan. A fresh builder check and one final fresh source review are required; no implementer delegation. Leave localhost healthy; no production/deployment/commit/push or real-recipient sends.
