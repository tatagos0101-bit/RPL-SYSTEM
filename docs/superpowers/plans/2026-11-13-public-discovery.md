# Public Discovery Implementation Plan

> Implement with existing React/JSX, Vite, Tailwind and Lucide patterns. Preserve all behavior. No dependency manifest changes, Git initialization, commits, or deployment.

## Files
- `frontend/src/index.css`: shared palette roles and import the scoped public stylesheet.
- `frontend/src/styles/discovery.css`: public landing/catalog/header visual system, responsive layouts and accessible motion.
- `frontend/src/pages/public/LandingPage.jsx`: presentation-only markup for the existing hero, journey, services and footer.
- `frontend/src/pages/public/PublicBrowse.jsx`: presentation-only heading/toolbar/results and class hooks; existing data and modal handlers remain.
- `frontend/src/components/Navbar.jsx`: presentation of current public navigation and duplicate links to existing Home/Catalog routes.
- `frontend/public/images/heritage-books.webp`: generated decorative book asset.

## Tasks
1. Preserve a source baseline under ignored .tools; inspect current source and Open Library. Establish hero, lower-section/footer, and catalog concepts plus separable book art.
2. Implement palette and scoped visual styling. Keep existing light/dark toggle and semantic status colors. Avoid global geometry changes to protected portals.
3. Apply landing and catalog markup using the same hooks, handlers, requests and destinations. Keep the original empty catalog and all existing modal behavior.
4. Verify syntax/lint/build and existing helper regressions. Compare non-presentation logic and event handlers against the baseline.
5. Use Chrome via Playwright because Browser reports unavailable. Verify desktop/mobile, light/dark, reduced motion, public navigation/search/filter/reset, modal keyboard/close/reservation destinations, pagination, and retry with isolated synthetic routes. Preserve a visual fidelity ledger and clean temporary QA artifacts.
6. Complete an independent implementation review, fix actionable findings, update architecture notes for the presentation change, and hand off local URLs with checks and limitations.

## Completion

All six tasks completed locally. See the linked design spec for visual comparison,
verification, intentional preservation differences and remaining browser limits.
No new application dependency or backend change.
