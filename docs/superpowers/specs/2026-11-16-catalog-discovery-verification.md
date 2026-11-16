# Catalog discovery: local verification

Completed locally on November16, 2026. The user requested working landing search, vertical public desktop catalogs, shared member catalog styling, real-data Featured sections and genre sorting. They confirmed favorites/Most loved instead of nonexistent ratings. Their later clarification requires member Featured rows to scroll sideways on desktop too; this is implemented without changing full catalog/genre desktop grids.

## Resulting behavior

- Landing Search/Enter carries a trimmed, encoded title/author query to `/browse?q=...`. Public catalog URL state survives refresh/back navigation and highlights literal matching title/author text with semantic `mark`; no raw HTML injection. Empty and failed results have reset/retry controls. Query helpers cap length and escape regex operators; SQL LIKE escapes `%`, `_` and the escape character.
- Public/full catalogs use wrapping vertical grids on desktop (>=800px, hover/fine pointer). Mobile/coarse-pointer devices retain horizontal swipe shelves, including wide phone landscape. Category tiles wrap on desktop. Existing top/bottom server paging and public login/reservation destinations remain.
- Member Featured shows existing recommendations only when owner-scoped historical reading stats confirm borrowing, then Trending, What's new and Books we love. New readers start with Trending. Each collection is independent and has meaningful loading/error/retry/empty feedback. **All member Featured collections remain horizontal on every screen**, with working44px arrows when overflowing, as the latest user instruction requires.
- Genre/All books sorting uses Trending, Newest, Most loved and Title. Newest uses library creation date; Trending counts30-day borrow activity including returned loans; loved uses active, nondeleted member favorites. Positive-only filtering prevents unloved items appearing in Books we love. Sorting/filtering/counting occurs in SQL before pagination, with stable ties and no private member fields in public output.
- Featured See all is available for Trending/new/loved and maps to the corresponding full catalog sort. Recommendations keep the existing ten-book result without inventing a paginated personalized sort. See all/category/search transitions reset the full-list page. Titles/authors/actions align consistently; covers retain their fixed contained frames.
- Existing favorite writes, reservation/capacity/pending-confirmation guards, account-scoped cart, cancellation IDs, intentional view recording and guarded detail fetches are retained. Favorite attempts trigger a fresh community-shelf read; loved-sorted full results refresh too. Fixed detail modal markup and keyboard handlers remain unchanged; navigation uses the selected shelf.

## Checks actually run

### Backend

- New18 discovery endpoint cases first reproduced16 intended failures and2 compatible existing behaviors. Tests cover library-age ordering, returned/recent vs old loans, exact30-day inclusion, active-member favorites vs staff/suspended/deleted/view-only feedback, empty positive favorites, global paging/ties, combined genre/search/availability filtering, literal wildcard/backslash search and invalid sort rejection.
- **30 passed**: `backend/tests/test_catalog_discovery.py` and `backend/tests/test_recommendations.py`.
- **31 passed**: `test_repair_retrieval.py`, `test_book_description.py`, `test_repair_basics.py`, `test_repair_reservations.py` and `test_reservation_policy.py`.
- Total: **61 targeted backend tests passed** using isolated SQLite, temporary synthetic inventory/activity and no production services. The installed virtual environment runner supplies the documented synthetic fixture PIN and disables pytest's optional Windows symlink helper. Used `-q -p no:cacheprovider --tb=no --show-capture=no --disable-warnings`, unique task basetemps and `tmp_path_retention_count=0`. Environment files were not modified.

### Frontend and browser

- `node --test frontend/src/api/*.test.js`: **98 passed**, including3 new query/highlight helper groups for encoding, bounds, literal operators/HTML-like text and Unicode preservation.
- Scoped ESLint from `frontend/`: **passed** for the changed pages, public catalog components and helpers.
- `npm.cmd --prefix frontend run build`: **passed** after the latest horizontal-shelf changes; existing credential scan passed across **79 built files**.
- Browser plugin unavailable; used the already-installed local Playwright/Chrome fallback with all API/upload paths intercepted by synthetic fixtures. No new browser dependencies or real member records/photos were used.
- **14 grouped browser flows passed** on final source: landing click/Enter, q/highlights/refresh/history, literal search/no injected HTML/no-results reset, desktop vertical rows, widths390/799/800px, cold/borrowed Featured order, sideways member arrows, full genre sorting/paging/See all, favorite error/pending/confirmed updates, shelf-aware fixed modal/view recording, exact cart/cancel/recovery guards, independent resource retries and phone light/dark capacity behavior. Checked page identity, nonblank content, no framework overlay, no relevant runtime errors, screenshot appearance and interaction outcomes.
- **3 focused browser probes passed** on final source: balanced desktop gutters and first-page reset; native dropdown keyboard operation/left-aligned titles/no page overflow with32px text on390px mobile; all4 Featured rows horizontal on1280px desktop plus a915x412 touch phone retaining a horizontal public shelf. Total: **17 browser check groups/probes passed**.
- Fresh review found uneven member gutters and retained paging when Featured/All books shared a server key. Both were reproduced red and fixed green. A subsequent focused review of pagination, horizontal mode and pointer-scoped grids reported **no actionable findings**. The final full UI rerun passed afterward.
- Screenshots were visually inspected for desktop light/dark, phone, search highlights, genre presentation and enlarged text. The reference uses compact genre tiles and separate curated shelves; this implementation uses the existing walnut/amber palette, real local inventory/activity and the user's requested desktop/mobile directions. No ratings or external editorial data were fabricated.

## Preservation and local runtime

Scoped copies/hashes replace Git diffs because this downloaded archive has no `.git`. **18 baseline files remain unchanged**, including manifests, profile/photo protections, shared layout/modal/cover, recommendation policy/hook, cart/capacity and reservation services. AST guards confirm **6 existing backend book functions**, **7 member business/presentation bindings**, **2 public navigation bindings**, both fixed modal trees and their keyboard handlers remain unchanged. Only the existing list endpoint gains search/ranking parameters; the ranking service performs reads only.

Before the API restart, validated exact `backend/rizal_library.local.db`, development/local storage, encryption/config checks and process-only `AUTO_MIGRATE=false`. Restarted only the recorded task-owned backend after checking PID/executable/start time and its Python/Windows console-host children. The frontend remained running. Final probes confirmed website/API HTTP200, new sort/favorites_only parameters in OpenAPI and HTTP422 for an invalid sort. All four actual local sort queries, combined with favorite-only filtering and an empty synthetic search probe, executed successfully without returning library records. Services remain available at `http://localhost:5173` and the local API on8000.

No dependency/schema/environment-file change, live PostgreSQL/Supabase validation, real patron/biometric fixtures, commits, pushes or deployment were performed. SQLite tests do not prove PostgreSQL concurrency or live production policies/performance; no recommendation accuracy claim is made. Deployment documentation notes that the updated API must precede its frontend after separate release authorization. No camera, delivery-provider or browser-engine coverage beyond local Chrome was required by this change.

Evidence is retained in `.tools/catalog-discovery-revision/art/`, scoped baselines, and synthetic QA scripts/logs. Only task pytest folders are cleaned after checked Windows path/reparse validation; unrelated work and ACLs are preserved.
