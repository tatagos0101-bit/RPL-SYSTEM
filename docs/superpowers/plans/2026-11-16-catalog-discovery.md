# Catalog discovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, with one required builder check and one fresh final review. No implementer delegation.

**Goal:** Preserve landing search terms, provide vertical desktop catalog browsing, and give members real-data featured sections and genre sorting.
**Architecture:** Extend the existing public FastAPI list with stable SQL ranking; reuse existing React shelf styles, recommendation/favorites hooks and circulation handlers. Shared small category/highlight/sort components serve the public/member surfaces. No schema/dependency or authentication changes.
**Tech stack:** React/JSX, Vite, Tailwind/CSS, React Router, Axios; FastAPI/Pydantic/SQLAlchemy.
**Spec:** [Design](../specs/2026-11-16-catalog-discovery-design.md)

## Global constraints

- Preserve walnut/amber, local Newsreader/DM Sans, rounded controls and existing fixed book modal dimensions.
- Desktop>=800px with hover/fine pointer wraps full catalogs/categories vertically; mobile/coarse pointer retains swipe shelves. Member Featured rows stay horizontal at every size (latest user clarification).
- Sorts title/trending/newest/loved are global before pagination; favorite-only shelves contain positive active-member favorites only.
- New members see Trending first; historical borrowers see the existing recommendations above it. Never infer new-member status from a failed reading-stats request.
- Keep auth, profile/name/photo protections, private uploads, reservation/capacity/confirmation/recovery and physical-copy behavior unchanged.
- No Git metadata: scoped baseline copies replace diffs; no commit/push/deployment. Use isolated SQLite/temp test fixtures and synthetic browser data only.

## Review focus

- Literal punctuation/Unicode/HTML-like search terms retain meaning and never become regex/HTML or unintended SQL wildcards.
- Equal ranks, returned loans, sparse history and filters stay correct across page boundaries without duplicates.
- Empty/failed recommendation, favorite or history resources never fabricate collections or block the main catalog.
- Member card/detail/favorite actions and pending-confirmation/capacity guards preserve exact original writes.
- Desktop/mobile breakpoint changes, keyboard sorting, enlarged text and reduced motion keep controls reachable.

### Task1: Server ranking and search

Files: new `backend/services/catalog_discovery.py`, modify `backend/routers/books.py`, new `backend/tests/test_catalog_discovery.py`.
Interface: `order_catalog(query, sort: str, favorites_only: bool=False)` returns an ordered SQLAlchemy Book query; GET /api/books accepts validated sort enum and favorites_only without changing the response shape or default title/id ordering.
- [x] Add red endpoint tests: newest by created_at not publication year; trending by recent borrow_date including returned loans and excluding older history; loved ignores staff/suspended/deleted/view-only feedback; positive-only empty/count/genre/availability filters; deterministic pagination/ties; literal wildcards; invalid sort. Synthetic rows only.
- [x] Run the tests with installed pytest and unique task temp directory, tb/capture disabled; confirm intended failures.
- [x] Add grouped ranking subqueries, optional favorite filter, stable ordering and literal LIKE escaping. No commits inside read services, no public member identity fields.
- [x] Re-run new tests plus recommendation/book/circulation regressions relevant to these queries.

### Task2: Search and responsive public catalog

Files: new `frontend/src/api/catalogDiscovery.js` and `.test.js`, new `frontend/src/components/public/SearchHighlight.jsx`, `CatalogCategories.jsx`, `CatalogSort.jsx`; modify LandingPage/PublicBrowse/CatalogBookCard/BookShelf/discovery.css and api/books.js as needed.
Interfaces: `catalogSearchPath(value)` returns encoded `/browse?q=...` or `/browse`; `normalizeCatalogSearch(value)` trims/caps query; `catalogMatchParts(text,query)` returns literal text/match pieces without HTML. Categories consume API category names, active category, books and callback; optional Featured uses null, All uses empty string. Sort is a native accessible select with optgroup Sort by and title/trending/newest/loved options. BookShelf gains optional heading action for sorting/See all.
- [x] Write/run red helper tests for encoded Unicode/reserved chars/empty/maxlength paths and literal case-insensitive repeated highlights. Reproduce the dropped-query/horizontal desktop behavior with a small synthetic browser test before implementation.
- [x] Wire landing submission and URL-backed public search; semantic literal highlights on titles/authors/results heading. Preserve reset, browser history, paging and login/reserve links.
- [x] Add desktop-only wrapping grids/category tiles and hide horizontal rail controls there; retain mobile rail behavior. Keep consistent cover/title/author/action dimensions and focus targets.
- [x] Verify helper tests, landing/Enter/deep-link/back/empty/no-results and desktop/mobile behavior in the browser.

### Task3: Member discovery presentation

Files: new `frontend/src/components/public/MemberCatalogCard.jsx` (or colocated member-specific component), new featured resource helper/hook only if needed; modify `frontend/src/pages/user/UserBrowseBooks.jsx`.
Interfaces: read stats via existing getReadingStats; featured12-book lists via getBooks(sort=trending/newest/loved,favorites_only for loved) with independent useReadResource states; existing useBookRecommendations supplies unchanged algorithm/favorite writes. Featured category is null, All empty string, real genres their actual names. Selection wrapper records active shelf then calls existing openBook; modal navigation consumes that shelf.
- [x] Define synthetic browser cases for cold vs historical borrowers, independent failures, sections/See all/genre sort and protected action payloads.
- [x] Rebuild browse presentation using shared catalog categories/shelves/grid and member cards with sibling detail/favorite/reserve/cancel buttons; preserve original add/cancel/open handlers and guards.
- [x] Show recommendation when historical stats>0, then Trending, What's new, Books we love; implement jump links/See all/search and genre sort. Keep allowance summary and top/bottom paging for full catalog.
- [x] Verify native dropdown keyboard access, global page sorting requests, favorite confirmation/error/pending state, exact cancellation IDs, cart/capacity/pending-confirmation safety, view recording only after opens and shelf-aware fixed modal navigation.

### Task4: Verification and handoff

- [x] Scoped lint, Node helper tests, relevant backend suites and build/credential scan. Inspect desktop/phone/light/dark screenshots using synthetic fixtures. Record Browser plugin unavailable and local Playwright fallback; never use real patron/private data.
- [x] Source guards against saved baseline for protected business handlers/components, untouched profiles/storage/auth and manifests. Fresh read-only whole-change review; resolve substantive findings with focused red/green checks.
- [x] Update architecture/setup facts and actual verification notes; preserve earlier work. Clean only task temp files with checked Windows paths, leaving denied ACLs unchanged.
- [x] Revalidate exact isolated local SQLite/local storage, disable AUTO_MIGRATE in process, restart only task-owned backend PID/executable/start time, confirm website/API health and new sorting route locally. Leave services running.

Completed locally, including the latest instruction for always-horizontal member Featured rows. See [verification](../specs/2026-11-16-catalog-discovery-verification.md).
