# One-click ready-reservation pickup

Use the existing inline execution/test/review workflow for this scoped change. The user explicitly wants Add to list without selecting QR/code/copy first.

**Design:** BorrowBookSelection already loads librarian-only read-only copy candidates for each ready reservation. Reuse availableReservationCopies and select the first validated available candidate automatically (server orders by copy number), while retaining an explicit optional choice behind Change copy if multiple copies exist. Show the proposed copy number/code beside Add to list. A ready reservation's Add button needs no dropdown interaction; queued/invalid/unavailable titles remain blocked. Adding is still local review-list selection, never a loan write or allocation. Preserve exact copy_id through the original submit/recovery path; show copy label in the pending/review list so staff hand over that physical copy. A reservation holds title capacity, not an exclusive physical copy. Final server policy/locks, stale-copy conflicts and retry-with-original-ID behavior stay unchanged. Walk-in and legacy QR/loan ambiguity remain unchanged.

**Files:** BorrowBookSelection.jsx (automatic default and optional selector/copy messages), CirculationDialog.jsx (borrow copy label display only), linked QR/architecture facts. No dependencies/schema/backend changes. Existing name/photo/navigation work remains untouched.

- [x] Reproduce the disabled Add button without choosing the dropdown using synthetic browser fixtures.
- [x] Implement the automatic default and optional Change copy; preserve filtering/async cancellation and expose exact copy in review.
- [x] Verify desktop/mobile, single/multiple/default/override/no available/error/loading/queued/already-added, refresh changed availability, duplicate clicks, reservation load failure/walk-in scanning, original exact-copy writes and conflict/recovery behavior.
- [x] Run existing copy/recovery helper and relevant circulation/reservation backend tests, scoped lint/build, preservation guards and fresh review. Use synthetic data only; no real scans/patron credentials or production services.
- [x] Update factual docs, clean checked task pytest directories and confirm localhost remains healthy. No backend restart is needed for frontend-only changes.

Completed locally. See [verification](../specs/2026-11-16-reserved-pickup-button-verification.md).
