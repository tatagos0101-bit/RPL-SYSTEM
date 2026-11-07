# Category normalization

The November 7, 2026 working tree uses the categories from
[Open Library’s Browse the stacks](https://openlibrary.org/): Crime, Drama,
Fantasy, Horror, Mystery, Romance, Sci-Fi, Thriller, Kids, History and Biography.
Featured is a collection rather than a genre. General remains the library fallback.
This copies the browse vocabulary, not Open Library’s complete subject hierarchy
or its internal classification algorithm. No catalog data was scraped.

## Mapping and review

The source of truth is `backend/services/category_service.py`. ISBN suggestions,
book saves, Excel imports and backfills use the same matrix. Preserve the selected
provider subject in `books.raw_api_label`; keep the public string in `books.category`.

Normalize case, punctuation and generic tags while protecting science fiction.
Match whole keywords/phrases, including whole-word YA. Canonical names round-trip.
With one category per title, audience (Kids) takes priority, followed by specific
genres in the documented matrix order; juvenile fantasy becomes Kids. Librarians
can override suggestions using any fixed master. This is deterministic matching,
not semantic understanding or an assertion of Open Library’s own assignment rules.

Unmatched subjects stay General with `is_hidden=true` for librarian review; the
book remains visible. **Book counts no longer publish arbitrary categories.** This
replaces the former 11-title promotion rule, which could recreate category bloat.
Romance now maps directly; an ambiguous label such as Regency England stays in review.

`category_override` preserves valid fixed-master librarian decisions. Legacy
combined/removed overrides are retained as provenance but no longer published;
reconciliation maps their original raw subject or sends it to review. An explicit
new category edit clears the override. Unrelated title edits preserve raw metadata.

The Add Book review panel uses librarian-only `/api/inventory/category-review`,
`/category-masters`, `/category-review/resolve` and `/category-suggestion` endpoints.
Only existing masters can resolve a subject. Browser suggestions are rechecked on
write. PostgreSQL category writes use a transaction advisory lock. No new tables,
public database access or background network classification are introduced.

## Existing data and rollout

Existing production labels do not change merely by editing code. Apply the updated
[specific category backfill](../supabase/operations/category_normalization.sql)
in one authorized transaction after backup and an isolated rehearsal. It keeps raw
labels and leaves book IDs, physical copies, QR identities, loans and reservations
intact. Repeated application is idempotent. The SQL mirrors the application matrix;
`test_otp_postgres.py` checks parity on PostgreSQL with synthetic subjects.

`python migrate.py` from `backend/` also reconciles categories but runs other
existing backfills. Do not use it as a read-only check or execute it on production
without approval. Keep `AUTO_MIGRATE=false`; do not regenerate initial migrations.
Coordinate the API rollout/backfill so an older writer cannot republish labels.
No live backfill was performed during this implementation.

`test_category_service.py` covers canonical names, sanitization, unknown labels
at/above the old threshold, original-label preservation, permission checks,
review, imports and repeatability. The current reconciliation scans titles during
category writes; profile before expanding to large concurrent imports.
