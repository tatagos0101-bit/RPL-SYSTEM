# Borrowing, inspections and membership approval

This release adds librarian-controlled circulation and accountability workflows. It does
not introduce a new account role, payment processor, biometric model or retention period.

## Librarian workflow

- **Add Book / Edit Book:** select **Can be borrowed** or **Library use only / reference**.
  The optional circulation note is displayed in book details. Server checks also reject
  borrowing and reservation requests for library-use-only titles.
- Changing an existing title to library use only cancels its open reservations and
  creates notices for those members. Existing loans remain returnable; history is retained.
- **Browse Books → Copies & sources:** review each copy's current status, last recorded
  condition and acquisition source. Record donated/purchased/other metadata using the
  existing acquisition editor. Unknown dates, costs and sources stay unknown.
- **Return Books:** identify the member, select the exact active loans and inspect every
  physical copy. Select a condition and structured remark, add optional notes and explicitly
  confirm the inspection before reviewing/submitting the return.
- Good and normally worn copies become available. Damaged and reported-lost copies remain
  unavailable and do not release stock to the reservation queue. A stock inspection can
  later restore a repaired/found copy, preserving its original QR identity.
- A lost-book report closes the loan through the return workflow, with an explicit
  `return_condition=lost` outcome. Its return timestamp records the closure, not physical
  receipt of a book. Circulation reports distinguish these closures from physical returns.
- Stock inspection cannot restore a retired copy or modify an outstanding loan. Inspect an
  on-loan copy through the return workflow. Ready reservation holds remain protected.
- **Users → Actions → Borrowing record & restrictions:** review current overdue loans,
  historical late returns, damage/loss assessments and the latest 25 librarian account
  decisions. Loan records are paginated. Warnings, suspension, blacklisting and reactivation
  use structured reason choices and optional notes visible to the member.
- Suspension and blacklisting revoke sessions and block access. Reactivation clears both,
  but current overdue books still block further borrowing/reservations. No automatic
  violation-count threshold suspends or blacklists an account.
- Existing account deletion still requires librarian confirmation and rejects outstanding
  loans. Deidentified loan/copy history remains; linked application identity and review
  notes are cleared with the existing deletion flow.

## Fees and due dates

The configured `LOAN_DAYS` and `FINE_PER_DAY` remain authoritative. The server sets
the due timestamp at borrowing and evaluates overdue records using Philippine time.
This is not a new scheduled reminder service.

The existing daily late fee is calculated at return/loss closure. A librarian can add
a nonnegative damage/loss assessment. There is no automatic fixed damage/replacement fee.
`fine_amount` is the combined assessed total; `late_fee` and `condition_fee` preserve
the breakdown for newly inspected loans. Old records retain their original fine amounts
without invented inspection metadata or fee breakdowns.

Assessments are **not proof of payment**. This release does not add payment collection,
settlement receipts, automatic fee-based suspension or automatic blacklisting.

## Remote registration and receipt

1. Applicants open **Member sign-in → Apply for membership** at `/register`.
2. They supply their name and location, optionally an email, and accept the displayed
   borrower terms. No phone, ID-image or face upload is required for an application.
3. The application receives a random receipt reference and pending status. The applicant
   can save/print the receipt. No user account, sign-in cookie or borrowing access is issued.
4. Librarians use **Membership Applications** in the staff menu or Users page. They can
   reject an application with a reason, or select **Register applicant in person** when
   the applicant visits with an original government photo ID. The required ID upload,
   OCR/portrait check and librarian attestation cannot be skipped. See
   [required ID and online face enrollment](REMOTE_FACE_ENROLLMENT.md).
5. In-person registration atomically approves the application and creates one member account. Concurrent/repeated reviews cannot
   create a second account. A conflicting existing email requires explicit review.
6. The existing credential delivery service sends the temporary password if email delivery
   is accepted. Otherwise a one-time private librarian handoff is shown. No phone/SMS
   delivery is attempted. Closing that handoff requires a librarian password reset if the
   credential was not safely delivered.
7. The temporary password expires in 24 hours. First sign-in requires a new password and
   the existing privacy-notice acknowledgment. New passwords require 8–128 characters and
   at least one digit. Submitted email addresses remain unverified until separately verified.

Applicants without email retain their receipt and contact the library desk for the result
and credentials. Rejected applicants do not receive an account. Receipt references are not
login credentials. The former anonymous member `/api/auth/signup` path cannot bypass approval;
authorized librarian provisioning remains separate under **Librarian Accounts**.

Librarian-assisted registration also offers a downloadable receipt without including its
temporary password. Members can review loan accountability and the borrower terms under
**Profile → Borrowing record, charges and terms**.

## Reports

- **Library visits logbook:** existing recorded attendance report with date filters.
- **Circulation & inspections:** publication year, ISBN, inspection condition/remark, staff
  identifier/time and assessed charges. Filter by condition, including reported loss and
  unrecorded historical conditions. Physical-return totals exclude reported-lost closures.
- **Collection & borrower counts:** publication data, circulation eligibility, copy condition
  and distinct borrowers for each title within the selected borrowing period. Repeated
  loans by one member count once in the distinct-borrower field. Per-title counts repeat on
  each copy row and must not be summed across copies.
- **Book acquisitions:** existing per-copy donated/purchased sources and verified metadata.
- **Inventory accountability:** publication information and damaged/lost physical-copy totals
  alongside declared/observed holdings and outstanding loans.

Existing export limits, CSV formula protection, HTML escaping, librarian authorization,
Philippine dates and snapshot/context checks remain applicable.

## Schema and release

Use the additive path in `backend/services/schema_migrations.py` / `backend/migrate.py`.
Do not regenerate an applied initial Supabase schema.

New fields are `books.is_borrowable/circulation_note`, `book_copies.condition`,
`users.is_blacklisted`, and the inspection/assessment columns on `transactions`.
The new `member_applications` and `member_account_actions` tables are private:
RLS enabled and no PUBLIC, anon or authenticated grants. FastAPI owns authorization.

Apply the reviewed schema before serving the new API. Keep production
`AUTO_MIGRATE=false`. No historical condition, fee, identity-verification or acquisition
claims are backfilled. Old in-browser return requests must be checked through the existing
receipt lookup; uncommitted returns now require inspection details.

SQLite regression and repeat-upgrade tests do not prove PostgreSQL lock behavior or
live-camera accuracy. Use the existing disposable PostgreSQL circulation suite when a
local test database is configured. Browser tests must use synthetic members and mocked
writes; do not create loans or send credentials as a production smoke test.

## Release verification - November 25, 2026

- Backend regression suite: 572 passed, 32 environment-dependent checks skipped.
  This includes the new workflow cases and repeatable SQLite upgrades with old rows.
  Disposable local PostgreSQL concurrency and live-camera trials were not performed.
- Frontend helper suite: 141 passed; lint, production build and credential scan passed.
  Camera fake-clock expectations now use the existing configured scan interval;
  this release does not change matching thresholds or presentation-attack detection.
- Local Chrome via Playwright: 18 checks at 1440px and 390px, using synthetic members
  and mocked API writes. Covered light/dark receipts, approval, sources and repair,
  inspected returns/reported loss, account review, member terms, reference books and
  report filters. No unmocked API requests or application console/page errors remained.
- Production additive migration `library_workflow_accountability_20261125` applied.
  Account/book/copy/loan counts, outstanding count and existing assessed-charge total
  matched before/after. Historical inspection fields remain unrecorded.
- Both new tables have RLS, no PUBLIC/browser table grants, backend-runtime CRUD and
  policies. The inspector foreign key is present. Security advisors returned no lints.
- Browser fixtures did not send live credentials or create production applications,
  loans, inspections or account restrictions. Production applications/actions were empty
  immediately after the schema check.
