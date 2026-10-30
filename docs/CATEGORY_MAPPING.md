# Category normalization

The authoritative implementation is `backend/services/category_service.py`. ISBN
lookups ask the librarian-only suggestion endpoint to choose a full provider label.
Single saves, book edits, Excel imports, and the migration backfill use the same
mapper before committing. No external metadata label is automatically trusted as
a public category.

## Sequence and storage

1. Keep the original selected label in `books.raw_api_label` (up to 1000 characters).
2. Normalize case, punctuation/separators, and generic tags for matching. Preserve
   the compound `science fiction`. Match YA as a whole word, not inside royalty.
3. Match the ordered matrix: Sci-Fi & Fantasy, Mystery & Thriller,
   Biography & Memoir, Business & Economics, Children & YA. First matching parent
   wins; e.g. juvenile fantasy maps to Sci-Fi & Fantasy. Master names round-trip.
4. `books.category` remains the public display string (80 characters) to preserve
   existing filters/recommendations/report contracts. Unmatched books display
   General with `books.is_hidden=true`; the book itself remains publicly visible.
5. Count unreviewed book/title records with the **exact trimmed raw label**, not copies or
   normalized variants. At 11 titles, publish that label (`is_hidden=false`). At
   10 or fewer after edits/deletions, hide it again. Counts are recalculated in the
   write transaction. PostgreSQL category writes use one transaction advisory lock.
6. Labels longer than 80 characters use a truncated display plus a stable hash
   suffix when published. The full raw label remains intact for review/counting.
7. `books.category_override` preserves librarian mapping to an existing master.
   Reconciliation keeps the override and the raw label. A subsequent category edit
   resets that override and reprocesses the new input. Unchanged display values
   during unrelated book edits do not erase the raw metadata.

Standalone General/Fiction/Nonfiction and empty Excel categories become General;
they are not pending new genres. Romance and Regency are deliberately not guessed
into another master: they remain pending unless the threshold or librarian mapping
resolves them. Expand the matrix only with an agreed taxonomy and regression tests.

The public category endpoint emits the mapped categories plus General. ISBN bulk
preview keeps a string rather than the former match-result object. Provider label
arrays are inspected in order, preferring a specific match over generic tags.

## Librarian review

The Add Book screen has a **Librarian category review** panel with pagination.
It loads `GET /api/inventory/category-review` and existing master options from
`GET /api/inventory/category-masters`. Mapping calls
`POST /api/inventory/category-review/resolve` with `raw_api_label` and
`master_category`. Only a librarian can access these endpoints. Resolution maps
all currently pending books with that exact label to an existing master; it cannot
publish an arbitrary new label below the threshold.

`POST /api/inventory/category-suggestion` accepts a bounded `labels` array and
returns the chosen raw label, mapped display, and pending flag without writing.
The write paths revalidate the category; browser suggestions are not authoritative.

## Migration and verification

Three additive book columns are registered in `services/schema_migrations.py`.
`python migrate.py` from `backend/` adds them and backfills existing categories.
This is a database mutation and also runs the repository's existing backfills:
use an isolated database first, take an appropriate backup, and obtain explicit
production authorization. Do not run application code against the old schema.
Keep production AUTO_MIGRATE=false. No initial migration was regenerated, new table
was introduced, RLS grant changed, or live database updated by this task.

Backfill stores each legacy category once before mapping; repeats are idempotent.
Existing book IDs, QR identities, inventory counts, reservations, and loans are not
changed by category reconciliation. Preserve a pre-migration backup for rollback;
the old application cannot safely share category writes with the new version.

Tests: `test_category_service.py`, `test_book_edit.py`, and `test_copy_qr_policy.py`
cover keywords, exact-label thresholds, copied inventory, authorized review,
provider suggestions, workbook headers, and repeatable SQLite upgrades/backfill.
SQLite does not prove PostgreSQL advisory-lock behavior or live cloud permissions.
The reconciliation currently scans book records on category writes, suitable for
this library's modest catalog; profile before scaling to large concurrent imports.

## Optional future relational model

A larger catalog can replace the compatibility string with
`master_categories(id, name)` and `category_labels(id, raw_label, normalized_label,
mapped_category_id, is_hidden, reviewed_by, reviewed_at)`, with a book-to-label
foreign key. Keep exact raw-label counts and review authorization server-side.
That redesign, extra tables, and new access policies are intentionally not included.
