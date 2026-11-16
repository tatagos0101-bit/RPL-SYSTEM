# Librarian dashboard and reports design

Date: 2026-11-13. Implementation authorized by the user's request to adapt the supplied dashboard references; Reports & Analytics explicitly included in the scope reply. Earlier instruction: design changes only. No further approval gate or production release is required for this local, reversible work.

## Intent and scope

Restyle the librarian workspace with the user's final walnut brown and amber palette, rounded controls, restrained modern motion, Newsreader headings and DM Sans UI. Adapt the compact sidebar, slim header, metric hierarchy and chart panels from the supplied screenshots and Cruip Mosaic Lite layout. Retain Rizal Provincial Library branding and existing React architecture. Public landing/catalog/login work is already complete and remains protected.

In scope: `LibLayout.jsx`, `LibDashboard.jsx`, `LibReports.jsx`, optional presentation props in `ReportChart.jsx`, a scoped `styles/librarian.css` imported after Tailwind from `index.css` (one import only), and factual architecture/verification documentation. No backend, API helper, dependency, schema, data, authorization, circulation or authentication changes.

## Approaches and decision

1. Adapt the supplied operational layout inside the existing React components. This is the selected implementation call: preserves all requests and interactions, supports the user's aesthetic and existing data.
2. Copy/install the Vue template. Rejected: unnecessary framework/dependency change, mismatched app and license obligations. Read its README for inspiration only; copy no template source or assets.
3. Only recolor existing drawers/cards. Rejected as insufficient for the explicitly requested dashboard hierarchy and persistent desktop navigation.

These implementation choices are the agent's calls under the existing authorization, not additional user requirements.

## Current source establishes behavior

The dashboard has ten drill-down metric definitions, real visit/circulation/collection/acquisition charts, prior-period comparisons, attention links, activity labels/times and member registration. Preserve every metric and its query parameters, all explanations and all charts. Recent activity is only `{id,label,at}`: no invented member/action/book fields. A catalog creation is not a verified acquisition.

The reporting query already returns `summary`, `charts`, `rows`, `filters`, `context` and `as_of`. Display those existing chart payloads above the records, without any new requests or fake membership growth/overdue records. Every category retains its real chart titles/types/points. Keep the query, sorting, pagination, context, cancellation, all four exports, monthly PDF, pending-filter restrictions, acquisitions editor, errors and loading behavior byte-equivalent in their logic. Keep server date helpers and Philippine-time labeling.

The shell already supplies notifications, read/read-all actions, home-brand navigation, mobile menu and eleven canonical staff routes. Keep them all. No global search, branches, fines, fictitious avatar, time-range toggles or additional commands.

## Layout and visual system

The primary dark walnut variant matches the supplied screenshots. Preserve the existing Settings light/dark switch with a coordinated warm-paper light variant (#f5efe4 canvas, #fffbf4 panels, #37291f ink, #705c4b muted, #825016 links). Sidebar/header retain dark walnut chrome in both modes. Scope every palette/typography rule below `.rpl-staff` so public/member pages remain unchanged. Staff route contents inherit the palette but receive no functional changes. This corrects the initial always-dark implementation call after source inspection of the existing appearance control.

- Canvas #241e19, sidebar/header #1e1915, panels #302820, hover #3a3026, border #514438.
- Main text #f6eddf, muted #c0b19c, action/link amber #edbf72 with dark action text #241c14. Positive muted sage #adca9d; danger #f2a79c. Chart colors amber, sage, dusty blue, mauve, coral with exact labels/table fallbacks.
- Display: existing locally hosted Newsreader; body/UI: existing DM Sans. No new font requests or assets.
- Standard space 8/12/16/20/24/32px, desktop gutter24px, max content1600px, radius14px panels/10px inputs/pill actions. Subtle shadows only. No glossy gradients, ornamental backgrounds, invented badges or decorative chart values.
- Existing RPL seal, compact grouped navigation (Workspace, Circulation, Library management), Settings and static Authorized Staff identity below. Preserve exact canonical route targets. All existing amber action buttons, including nested white utility labels/icons, receive dark ink for contrast. UI label Home may be Dashboard; Reports may be Reports & Analytics.
- Desktop >=1180px: persistent 232px sidebar. Smaller widths: existing offcanvas navigation, same open/close/overlay/link handlers. A presentation-only matchMedia subscription controls inertness so desktop links remain operable; cleanup the listener. Desktop hides drawer close/hamburger/overlay. At mobile only the expanded drawer is interactive.
- Slim header: existing home brand action, route label and notification bell. No fake search. Main page has one h1 and existing primary actions.
- Dashboard: four dominant metrics (catalog titles, registered patrons, current loans, overdue), six smaller linked metrics below. Preserve each definition exactly; only order/styles change. Wide borrowed/returned comparison plus physical-copy status donut, recent activity next to most borrowed titles. Visits, previous-period trends, collection/demand, acquisitions/coverage, least borrowed and attention remain accessible lower down with original meaning/copy/links.
- Reports: heading/actions, clear filter and monthly-PDF panels, four existing preview statistics, existing response charts in a two-column responsive grid, then the original sortable/paged records table and download limit note. Full chart set stays visible; no re-query or synthetic extra sections.
- Existing ReportChart defaults remain the same for other consumers. Optional `variant="staff"` adds classes and renders grouped borrowed/returned as two straight, unsmoothed lines with distinct dashed/solid strokes and point shapes. Preserve values/scales/tooltips/focus/data tables and default grouped bars. No curve implying unmeasured data. Donut legend includes counts, not invented percentages.
- Motion: one brief 280ms opacity/translate entry for page content, 160ms hover/focus transitions, existing loading indicators. Never animate numeric data or continuously move charts. Reduced-motion displays final static state; no stagger on every sidebar click.

## States and accessibility

All original errors, retained dashboard data on refresh failure, empty charts/activity, loading states, pending filters and export disabled states remain. Display existing zero values and missing comparison baselines accurately. No hiding warnings to match the reference.

Use semantic headings, existing event bindings, visible amber focus, native form labels and modal handling. Preserve chart focus marks, live description and data tables. Prevent page overflow at320px, support200% text, wrap metric dates/long titles and let tables scroll inside labeled regions. Main/sidebar height and scroll adapt to short screens. Notifications remain contained at mobile and200% text.

## Verification and privacy

Use fresh isolated browser contexts with synthetic session, dashboard, report, notifications and book/member metadata, intercepting only `/api/` requests (never Vite source modules). No actual patron/account/biometric records in screenshots, generated concepts, logs or external services. No database writes or real exports needed. Capture synthetic desktop/mobile screens and compare with full concept images at native sizes.

Keep source baselines/hashes because this download has no .git. Verify original business prefixes and canonical route/metric tuples, protected API/helpers/public/login/manifests, and untouched backend tree. Run existing83 helper tests, scoped lint and production build/credential scan. Browser-check desktop/mobile sidebar inertness, resize, keyboard navigation, notifications read APIs, registration open/close, all metric URLs, report filters/reset/query bodies/context/pagination/sort/export cancellation/monthly PDF/error/loading/empty states, chart keyboard/table values,200% text and reduced motion. Review shell compatibility on other staff routes with synthetic endpoints. Physical cameras and production services are out of scope.

## Artifacts

Concepts and final renders: `.tools/librarian-design/art/`. Baselines: `.tools/librarian-design/baseline/`. Plan: `docs/superpowers/plans/2026-11-13-librarian-workspace.md`. Verification and fidelity ledger will record actual outcomes and any necessary deviations; one-off QA harnesses/captures are removed after final checks.

## Cascade constraint confirmed during review

The staff stylesheet must be imported by the existing root CSS entry after Tailwind, alongside auth/discovery. Importing it directly from LibLayout placed its utilities layer ahead of Tailwind preflight in development, changing global utility precedence. The index change is exactly one import; global theme roles and existing style rules remain byte-identical. Actual amber action backgrounds and labels must both be checked.
