# Public Experience Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved simpler walnut/ivory public website with Open Library category/shelf catalog layout and Vantara-inspired photo scale and restrained motion.

**Architecture:** Preserve existing hooks, handlers, routes and API contracts; replace presentation only. Isolate cover shelves and overflow arrows in public-only components. Keep motion native and local, with reduced-motion fallbacks.

**Tech Stack:** Existing React/JSX, Vite, Tailwind/CSS, React Router, Lucide; no new runtime dependencies.

**Spec:** ../specs/2026-11-13-public-experience-revision-design.md, approved by user: Proceed with this plan.

## Global Constraints

- Walnut brown and amber are the latest user-selected public colors. Existing application functions remain unchanged.
- Public catalog uses real API categories/current page, with no invented ranks, curation, subgenres or extra data fetches.
- Keep all account, auth, recovery, camera, reservation, pagination and role behavior.
- Scope styling to public discovery/navigation/auth; preserve unrelated work, backend and dependency manifests.
- No inventory writes, production changes, migrations, commits or deployment.

## Review Focus

- One/zero loaded covers: honest sparse layout, neutral category art and robust no-cover fallback.
- 100 results plus pagination: local shelf scroll must not change the server page/filter contract or query counts.
- 320px/200% text/reduced motion: complete readable controls, native scrolling and no horizontal page overflow.
- Category/search/page switches and modal keyboard focus: retained handlers and no reset or focus regressions.
- Saved dark mode and both login roles: scoped palette, readable forms, unchanged password and synthetic Face ID behavior.

### Task 1: Baseline, complete visual concepts and asset inventory

Files: .tools/public-revision/baseline/**, .tools/public-revision/art/**, this plan and progress.md.
Produces: fixed concept set, original source baseline, licensed local responsive photos, source/behavior guard and browser acceptance harness.

- [x] Preserve current targeted source and dependency baselines; inspect source and supplied references.
- [x] Inspect licensed library photography; create coordinated catalog, landing opening/continuation and auth concepts using built-in Image Gen.
- [x] Record palette/type/copy/assets, intentional adaptations and illustration-only fixture content.
- [x] Write meaningful browser checks for shelf visibility, scrolling, old request contracts, responsive layout and retained actions; observe the initial shelf check fail on the old layout.

### Task 2: Public catalog and navigation presentation

Modify: frontend/src/pages/public/PublicBrowse.jsx, frontend/src/components/Navbar.jsx, frontend/src/styles/discovery.css.
Create: frontend/src/components/public/BookShelf.jsx and CatalogBookCard.jsx (public-only).
Consumes: book objects and existing selected/category/search state. Produces: horizontally navigable view of current books with the same book-selection callback.

- [x] Replace oversized heading/art and pill filters with compact search, category cover tiles, selected marker and ivory panel.
- [x] Present real current-page covers in a native overflow shelf with independent local arrow controls, natural cover proportions and persistent detail action.
- [x] Preserve original modal JSX/events and hooks; category artwork uses only loaded matching covers.
- [x] Verify actual one-book, synthetic many-book, empty/error, dark/mobile, filtering/page/request and detail/Escape/focus cases; compare catalog concept/render.

### Task 3: Landing composition and bounded motion

Modify: frontend/src/pages/public/LandingPage.jsx, frontend/src/styles/discovery.css.
Create: frontend/public/images/library-window-1600.webp, library-window-800.webp, reading-room-1200.webp and asset credits.
Consumes: approved photo/layout and unchanged FEATURES/STATS/copy/routes. Produces: large photographic first viewport and simple service/footer continuation.

- [x] Replace decorative book render/arch with local responsive licensed photo; preserve existing form submit/query/navigation and links.
- [x] Replace repetitive numbered decoration with simple service rows and photo/text composition; retain footer/contact/privacy copy.
- [x] Add short entry/scroll reveal and gentle image motion via CSS browser APIs; leave native scroll/input active and reduced-motion content visible.
- [x] Verify all sections against native-size concepts, desktop/mobile/200% text, actual image bytes/requests and existing navigation.

### Task 4: Login consistency

Modify: frontend/src/styles/auth.css only where practical; LoginPage.jsx only if presentation needs a hook, never business logic.
Consumes: existing split layout and revised public identity. Produces: neutral right panel/simpler backdrop, same controls and behavior.

- [x] Retain split form, reduce metallic brass to warm neutral and use the revised photo/color/type treatment.
- [x] Verify both role layouts, loading/errors/recovery/back destinations, password visibility and synthetic webcam tab/route cleanup; confirm source AST business prefix/events/props unchanged.

### Task 5: Final verification and independent review

Files: targeted product diffs, docs/ARCHITECTURE.md, implementation/fidelity notes.

- [x] Run changed JSX ESLint, npm --prefix frontend run build and node --test frontend/src/api/*.test.js; inspect outputs.
- [x] Run source AST guards and meaningful Chrome checks covering the five review focus conditions. Browser plugin first, installed Chrome fallback if unavailable.
- [x] Use view_image for final concepts and corresponding native-size renders, with copy/layout/type/color/assets/density ledger; correct actual mismatches.
- [x] Obtain fresh independent whole-change review, address actionable findings, preserve final design evidence and remove one-off QA artifacts.
- [x] Document actual checks/limitations and local URLs. Leave development services available.

Execution ruling: this downloaded workspace has no Git metadata. Work in the authorized directory with exact source baselines instead of creating a worktree or making commits. Existing dependencies and local services are already installed. The user explicitly authorized implementation, so the approved direction plus internal concept review covers execution without another routine permission step. New behavior tests apply to public shelf view controls; style-only changes use rendered QA rather than implementation-mirroring unit tests.

Completed locally after incorporating user font, round-corner, palette and retained-login steering. See the revision verification document for source guards,20 browser checks,83 helper tests, source-review fixes, fidelity/provenance and baseline limits.
