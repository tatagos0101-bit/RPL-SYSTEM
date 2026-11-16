# Stable public genre cover previews

The public category tiles currently derive cover images from the filtered result page. This makes All books mirror the selected genre and removes other genre covers. Give navigation its own stable metadata; result filtering must not mutate tile artwork.

- [x] Add failing API tests for optional category previews: default category/count contract unchanged; up to 3 cover/id records per visible category, stable title/id ordering, no empty/hidden-category art, rare genres beyond the first 100 results, empty inventory and bounded query count.
- [x] Add a read-only grouped/window preview query in catalog_discovery.py. GET /api/books/categories accepts include_previews=true; default callers retain exact current shape. No schema/storage/auth/write changes. Return only public artwork reference and book ID, bounded per genre.
- [x] PublicBrowse uses a separate category-preview API helper; shared CatalogCategories uses returned preview arrays, including explicit empty arrays, independently of search/genre/paging. All books combines previews across genres. Keep existing member caller fallback for compatibility; member business logic is outside scope.
- [x] Reproduce current changing thumbnail DOM, then verify stable image sources across genre, All, search and pagination on desktop/mobile, rare genres and missing artwork. Preserve current filters/search/modal/paging, plus the pending librarian View details work.
- [x] Run relevant backend category/discovery tests, frontend helpers, scoped lint/build/secret scan and fresh source review. Document compatible API-first release order, validate isolated local config/migrations disabled, restart only owned API and verify local reads. No production changes, dependencies/schema/commits/pushes.

Completed locally. See [verification](../specs/2026-11-16-category-previews-verification.md).
