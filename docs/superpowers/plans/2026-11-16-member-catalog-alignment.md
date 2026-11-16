# Member catalog alignment and bottom pagination

**Goal:** Fix the three requested member Browse Books issues while keeping existing catalog, favorite and reservation behavior.

**Approach:** The current recommendation card positions the badge at top-2 and the heart at top-10, causing the mismatch. Put both in one top toolbar aligned through flex, retaining the full 44px favorite target and a readable 12px unbroken label. Keep existing overlay click-through behavior and handlers. Replace the centered All Books divider with a left section heading that uses the same type/icon spacing as Recommended for you. Add a second instance of the existing PageControls below the book grid, with clearly named top/bottom navigation wrappers and the same listing state. On a page change, scroll to the catalog heading using reduced-motion-aware scrolling so a bottom-page change starts at the new list. No backend, API hook, search/category, favorites, reservation, theme or dependency changes.

**Validation:** Synthetic browser fixtures only; no real patron records. Browser plugin/skill absent, so use existing Playwright/Chrome. Check baseline mismatch/missing bottom pager, then final horizontal badge-heart alignment and nonoverlap, heading alignment/type, lower Next/Previous with exact skip/filter requests and synchronized disabled/loading state. Exercise favorite add/remove, details under the badge, reserve selection, empty/single-page, desktop/mobile and enlarged text. Run changed-file lint, build/credential scan and source preservation checks. No new permanent unit tests for presentation wrappers; browser checks cover the new control's actual behavior.

- [x] Capture baseline and failing browser assertions.
- [x] Make the scoped JSX changes and prove their interactions in the browser.
- [x] Verify source preservation, lint/build, inspect screenshots and obtain focused review; leave localhost running.

Completed locally; see [verification](../specs/2026-11-16-member-catalog-alignment-verification.md).

## Additional viewer correction requested during implementation

Remove the bottom book-position slider/counter bar. Keep arrow, keyboard and swipe navigation plus the existing cover position badge. Give the viewer a consistent viewport-bounded width/height and fixed cover frame for missing, portrait, square and landscape covers. Contain cover artwork without stretching; allow long details to scroll inside the fixed viewer and keep Close reachable. Reuse current modal/favorite/reservation handlers. No backend changes.

- [x] Prove the variable viewer size and existing slider with synthetic covers.
- [x] Apply fixed responsive viewer/cover geometry, remove the footer and verify short/long/missing-cover cases, internal scrolling, navigation and actions.
- [x] Recheck the original alignment/pagination changes, lint/build and focused delta review.

Viewer extension completed with visible phone arrows and matching landscape columns;22 grouped browser checks passed.
