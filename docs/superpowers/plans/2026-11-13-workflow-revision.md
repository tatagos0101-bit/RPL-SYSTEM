# Workspace and Circulation Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. One builder check of the completed functional spec and one fresh final code review. No worker delegation.

**Goal:** Implement the user's navigation/theme/alignment corrections and requested book-description/reservation-first borrowing changes.

**Architecture:** Existing React routes, API client, current-member reservation endpoint and read-only copy lookup; preserve original circulation writes and recovery. Book metadata persistence uses an additive nullable column after note visibility is clarified. No new dependencies.

**Tech Stack:** React/JSX, CSS/Tailwind, FastAPI/Pydantic/SQLAlchemy, SQLite development/PostgreSQL target.

**Spec:** [Design](../specs/2026-11-13-workflow-revision-design.md)

## Global constraints

- Preserve unrelated work, authentication, roles, copy identity, reservation queue/holds, review/confirmation, per-item idempotency and unknown-outcome stopping.
- Scope member changes to colors/type; preserve its layout and functions.
- Remove Add Book acquisition UI only; existing acquisitions, imports, pending original payloads and reports remain supported.
- Test on synthetic fixtures/isolated SQLite. No production access, destructive migration, commit or deploy.

## Review focus

- Closed desktop drawer must be visually hidden AND inert; opening/closing/resize must not make links inaccessible.
- Member theme must not alter UI handlers/layout or break dark mode and amber-label contrast.
- Notes must persist with the requested visibility, validation, safe plain-text rendering and old nullable rows; repeated migration must preserve existing data.
- Reservation loading errors must not masquerade as no reservations; pending holds remain unborrowable, exact physical copies still selected and server validation remains final.
- Reserved and scanned items share one cart; duplicates, stale/unavailable copies, review, recovery and camera release remain correct.

### Task1: Navigation, member theme and inventory

- [x] Inspect source, preserve working-tree baselines and diagnose wrapping/persistent-sidebar causes.
- [x] Record baseline failing browser assertions for desktop drawer and broken inventory wrapping.
- [x] Restore drawer behavior on all viewports; add scoped member theme and inventory alignment CSS/classes only.
- [x] Test original event/business preservation, both themes, responsive layouts and action readability.

### Task2: Descriptions and Add Book

- [x] Resolve the note-visibility question, inspect schema/import/lookup contracts and complete the functional design; obtain builder check.
- [x] Add focused failing backend/frontend tests for persistence, validation, nullable old rows, repeated upgrade and online/manual fallback behavior.
- [x] Implement additive schema/API support and Add Book fields; preserve idempotency and existing import/acquisition semantics.
- [x] Run relevant regression tests; apply only the necessary additive upgrade to the verified isolated local database and restart without auto-migration.

### Task3: Reservation-first Borrow / Return

- [x] Specify tests for direct Borrow/Return launch, automatic reservations, no-reservation scan fallback, fetch errors, pending/expired reservations, exact copy selection, duplicate cart entries and existing recovery flows.
- [x] Implement two page buttons and default dialog mode; add a focused reservation-list/copy-selection component using existing endpoints and shared cart.
- [x] Keep the original confirmation/recovery/write implementation unchanged. Run meaningful helper/backend regressions and synthetic browser/camera cleanup checks.

### Task4: Final verification and local handoff

- [x] Run changed-file lint, full helper suite and final build/credential scan.
- [x] Review final implementation independently, fix material findings and verify affected cases.
- [x] Inspect synthetic screenshots, update accurate architecture/setup notes and verification ledger; remove disposable QA artifacts.
- [x] Confirm localhost health and leave the complete app running.

Completed locally November 16, 2026. See the [verification ledger](../specs/2026-11-13-workflow-revision-verification.md) for actual checks, local schema handling and remaining environment/hardware limits.
