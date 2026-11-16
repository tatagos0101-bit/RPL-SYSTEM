# Librarian Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, task by task. No per-task delegation; one fresh final review.

**Goal:** Restyle the librarian shell, dashboard and reports to the user's walnut/amber references while preserving all existing functions.

**Architecture:** Existing React routes, hooks, requests and report payloads remain authoritative. Scoped staff CSS supplies the visual system; one presentation-only responsive sidebar state and an opt-in chart variant support the layout. No backend or dependency work.

**Tech Stack:** React/JSX, Vite, Tailwind, React Router, Lucide, native SVG and CSS.

**Spec:** [Librarian workspace design](../specs/2026-11-13-librarian-workspace-design.md)

## Global Constraints

- No business/API/auth/database/camera changes, new tooling, dependency upgrades, Vue or TypeScript conversion.
- Preserve all ten metric definitions, chart payload values/types/titles, real periods and comparison limitations.
- Keep all eleven navigation destinations and all original notification/report/export/registration bindings.
- Protect public/catalog/login work and use only synthetic protected browser data.
- No commits, push, deploy or migrations; no Git metadata exists in this download.

## Review Focus

- Desktop-to-mobile resize must keep desktop navigation interactive and a closed mobile drawer inert.
- Pending filters must continue to disable stale exports, sorting and pagination; query/export context must match.
- Zero/empty charts, long titles and200% text must retain labels, focusable marks and data tables without page overflow.
- Dashboard refresh errors must preserve previously loaded values and warnings without fabricating replacements.
- Shared shell restyling must leave other librarian routes and protected auth redirects usable.

### Task1: Visual system and shell

Files: `components/LibLayout.jsx`, new `styles/librarian.css`, one CSS import in `index.css`; preserve API navigation/shell helpers.

- [x] Inspect relevant sources, setup/architecture and reference README; capture baseline hashes.
- [x] Run builder check of the design; resolve important questions against source/user constraints.
- [x] Generate and inspect complete dashboard/reports/continuation concepts before product edits; document native dimensions.
- [x] Record a baseline browser check showing desktop navigation currently closed; retain test for desktop/mobile/resize inertness.
- [x] Implement scoped tokens/type, persistent desktop and existing mobile drawer, grouped canonical links/header/notification styles.
- [x] Check all navigation routes, mobile controls, notifications and shell compatibility; preserve original requests and bindings.

### Task2: Dashboard and reports presentation

Files: `pages/lib/LibDashboard.jsx`, `pages/lib/LibReports.jsx`, `components/reporting/ReportChart.jsx`, scoped CSS.

- [x] Add browser assertions for preserved metric URLs, actual response charts, grouped chart keyboard/data equivalence, pending filters/export/context and empty/error states. Confirm new presentation checks fail on baseline before edits.
- [x] Restyle/reorder dashboard while retaining all ten tuples and chart/copy/link content.
- [x] Display `result.charts` in Reports with the original results/filters/exports untouched; add only opt-in SVG staff presentation.
- [x] Run scoped lint,83 helper tests and production build/credential scan; inspect errors before fixing.
- [x] Exercise synthetic desktop/mobile/200% text/reduced-motion flows and verify original logic/payload invariants against baselines.

### Task3: Review, visual verification and local handoff

Files: verification/spec/plan and factual `docs/ARCHITECTURE.md` only.

- [x] Request one fresh code review after implementation; resolve material issues and run targeted checks for resulting edits.
- [x] View full concepts and latest native screenshots in the same final image-inspection pass. Record >=5 concrete fidelity comparisons per main surface and necessary deviations.
- [x] Update architecture and actual verification outcomes. Preserve concepts/baselines/final renders; remove disposable QA harness/logs/captures with validated paths.
- [x] Confirm local web/API health, leave servers running and hand off concise local links and checks actually passed.
