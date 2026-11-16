# Workspace theme, navigation and inventory alignment revision

Date: 2026-11-13. User authorized these concrete corrections to the existing design. Implement directly inside the existing React/CSS system; no new concept generation or approval round is needed for these constrained fixes.

## Requested behavior

- Librarian sidebar is closed/inert initially on every viewport, including desktop. The same hamburger, close, overlay and link actions open/close it. Remove persistent-desktop CSS margins/visibility and the desktop matchMedia override; preserve actual-height notification measurement and original notification handlers.
- Member pages inherit walnut/amber and warm-paper light/dark colors with the existing local typography. Preserve all member layout/component structures, routes, requests, account controls, reservations, profile and camera behavior. Only a root class, scoped theme stylesheet and presentation color constants may change. Do not restyle/rebuild individual member layouts.
- Librarian inventory retains all actions, content, queries and column definitions. The screenshot's letter-by-letter wrapping comes from permissive inherited overflow wrapping combined with a700px minimum table and crowded action columns. Give the table enough intrinsic width, keep headers/year/copy counts/status/actions on one line, allow full titles to wrap and place narrow screens in an accessible horizontal scroll region. Keep rows vertically aligned and action icons stable. Acquisition actions on Inventory remain; user only requested acquisition-field removal from Add Book.

## Constraints and checks

Use the existing layered root CSS entry after Tailwind, with member-only rules scoped below .rpl-member. Amber actions require dark foreground, including nested/hover utility labels, to avoid previous white-on-amber failures. Do not introduce a utilities layer before Tailwind. Preserve both appearance switches and source business/event bindings. Test desktop and mobile closed/open sidebar/inertness, current member screens with synthetic fixtures, both themes,200% text and inventory long-title/status/action layout. Existing source snapshot, scoped lint, production build/credential scan and helper tests establish regression evidence.

## Separate requested functional work

The same user also authorized an editable book description/manual fallback replacing Acquisition details on Add Book, and explicit Borrow/Return entry buttons plus automatic member-reservation visibility with optional scan/manual-code entry. Book model currently has no description column; the user confirmed descriptions should appear in the public/member catalog. A separate implementation section will record that decision, additive migration and regression cases. Existing reservation/copy, server validation, idempotency, review, recovery and camera cleanup policies remain authoritative. No production/cloud changes or real patron data may be used.


## Functional design: optional catalog description

The user confirmed catalog visibility. Add a nullable `Book.description` text column, a max2000-character plain-text optional value in BookCreate/BookUpdate/BookOut and an additive `ADDITIONS` entry in existing schema_migrations. Old rows remain NULL; repeated upgrade preserves existing values. Do not regenerate an applied initial schema, change auth/RLS or use live Supabase resources.

The Add Book single-entry form replaces AcquisitionFields with an optional Description field, a visible catalog-visibility explanation and character count. If ISBN lookup supplies a summary, offer an explicit Use online summary action; manual text stays editable and is never silently overwritten by a later lookup. Missing/failing online lookup still allows full manual entry. New descriptions are plain text; strip provider markup and limit returned online summaries to2000 characters. Continue using the existing Google Books then Open Library providers, via an extracted frontend API helper. Keep the original category suggestion/cover handling and ISBN validation. Bulk ISBN rows retain online descriptions and allow per-book edits; pending or imported rows cannot be changed. Workbook may supply an optional Description column; old workbooks remain valid.

Remove the AcquisitionFields UI from both manual and ISBN-batch sections and the optional-acquisition explanatory blurb on this page. Do not delete acquisition models, endpoints, reports, inventory acquisition actions, import support or previously recorded data. Original pending journal payloads and idempotency keys remain authoritative when retried. Avoid adding a description:null field to legacy creation fingerprints: omit only this new absent/blank optional field when calculating the canonical request hash so pre-upgrade retries remain compatible. A changed nonempty description with the same key must still conflict.

The public detail modal already renders `selected.description` as text; BookOut persistence will populate it. Add the same optional plain-text section inside the existing member book-detail content, with no member layout/workflow change. No HTML injection or private librarian-note feature. Existing book update payloads that omit description must preserve it; explicit empty/null may clear it.

## Functional design: Borrow / Return and reserved titles

`LibBorrowReturn` exposes separate Borrow books and Return books buttons and removes the Quick Scan Session/flow strip. Pass an optional initialMode prop into the existing CirculationDialog; initialReturn still takes precedence and all other callers remain compatible. Return launch starts with the existing QR/manual lookup. Borrow launch identifies the member through the existing Manual ID/face flow.

After member identification, a focused BorrowBookSelection component loads the existing librarian-only getMemberReservations(member.user_id) endpoint automatically. Show ready and pending title reservations, status, queue/expiry where present; do not fabricate an exclusive copy assignment. For ready reservations, load physical candidates through the existing read-only lookupCirculation(book_qr,'borrow') endpoint. Expose exact copy number/code in a labeled select and an Add to list action; no QR scan is required. Available copies must match the reserved book, be marked available, have valid copy identity and not already be in the cart. A reserved title already in the cart cannot be added again from this component. Pending reservations remain visible and cannot be picked up. Missing library code, no available copy and fetch failure have clear states/retry or scanner alternatives; never report a failed fetch as no reservations.

When there are no active reservations, show the current QR/USB/manual-code scanner as the default walk-in path. When reservations exist, it is an optional Scan or enter another book control. Unmounting/hiding the optional scanner, review, mode changes and page hiding continue to release camera resources through the unchanged QrScanner. Failed reservation loading still offers retry plus an explicit optional scanner, not an automatic claim of no reservations.

Reserved and scanned copies feed the same existing cart and confirmation path. Keep payloadFor, confirm, recover, request IDs, account checks, per-item outcomes, exact transaction IDs for returns and unknown-outcome stopping unchanged. Selection/lookup must never submit a loan. Server copy association/availability, overdue/quota/hold and duplicate-loan rules remain authoritative at explicit confirmation. Update only scan-specific instructional wording where selection now includes a non-scan path.

## Boundaries and implementation calls

The descriptions feature requires a schema upgrade; apply it only on the verified isolated local SQLite target with startup migration disabled. Use the existing additive migration service rather than migrate.py's unrelated legacy biometric/category backfills. Test upgrade on isolated old-schema rows twice before touching that local development schema. Cloud/production upgrade remains a separately authorized deployment task. Schema generation for a new empty deployment may include the model through the existing generator, but do not overwrite the applied initial SQL file.

No new library, framework, table, auth method or reservation/circulation endpoint is needed. Two existing helper signatures may accept optional AbortSignal/options for cleanup without changing existing call behavior. The existing theme/design family is reused; these constrained additions do not need new raster assets or a design-system rewrite. All screenshot/test data must be synthetic.

## Required focused regressions

Description validation/normalization/optional clearing and old-row output; authenticated librarian create/update/public retrieval; anonymous/member/wrong-role/suspended writes remain rejected; pre-upgrade idempotency hash compatibility and changed-description conflict; source/import categories and copy/acquisition identities unchanged; workbook Description optional; SQLite repeated upgrade with existing rows and PostgreSQL DDL compilation (live PostgreSQL not implied).

Frontend provider-summary extraction/markup stripping/length/missing summary, manual text preservation, old journal retries, batch edit restrictions and payloads. Borrow selection pure helpers reject wrong-book/unavailable/retired/missing/duplicate copy candidates; ready/pending/expired, member switching/cancelled fetches, error/retry, QR fallback and zero-reservation path. Browser tests prove no writes before explicit confirmation, same payload/receipt/recovery, return quick actions, optional camera cleanup and responsive keyboard use. Existing backend circulation/authorization/reservation/migration suites remain required if available; physical PAD/camera accuracy is not claimed.
