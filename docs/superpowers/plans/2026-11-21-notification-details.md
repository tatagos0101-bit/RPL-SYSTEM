# Notification Details Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task and request one final review.

**Goal:** Member and librarian notification items open their complete details, with a paginated notifications page and links to the appropriate existing workflow.

**Architecture:** Reuse the current notification table, role-specific APIs, layouts, theme and read actions. Add owner-protected detail reads and bounded list pagination without a schema change. A shared, lazy-loaded React page provides full text, Philippine timestamps, confirmed read state and related-page links.

**Tech Stack:** Existing FastAPI/SQLAlchemy, React Router/JSX, Axios and theme CSS; no new dependencies.

## Constraints and review focus

- Preserve member ownership, librarian-only shared notifications, suspended-session and temporary-password restrictions.
- Notification text is rendered as text, never HTML or a destination URL.
- GET requests do not mark notifications read; the existing mutation does so after a detail opens.
- Reading failure must not prevent viewing the message or falsely clear its unread state.
- Handle old IDs, empty lists, failed fetches, long messages, paging, route changes and mobile widths.
- Existing notification defaults and transaction/reservation behavior remain intact.

## Tasks

- [x] Add regression tests for exact detail access, ownership/role/session rejection and stable bounded paging; observe failures, then implement the API changes.
- [x] Implement the shared notification page, safe related links and both role routes. Make bell items navigate, add View all, and refresh read indicators after confirmed changes.
- [x] Verify helper tests, backend regressions, frontend lint/build, and synthetic desktop/mobile browser flows including failed reads and old IDs.
- [x] Review the complete diff, update architecture/setup notes as needed, and publish under the existing main-branch authorization after checks pass.

## Verification

Nine isolated backend access/pagination tests and 109 frontend helper tests passed, as did frontend lint/build and the build credential scan. Synthetic Chrome checks passed for member and librarian menus at 1440px and 390px: menu-to-detail navigation, complete message text, confirmed read state, bell/page synchronization, failed-read retry, reload, missing IDs and no horizontal overflow/runtime errors. Final review found one read-state synchronization warning; it was fixed and browser-regressed before publishing. No schema/environment upgrade is needed.
