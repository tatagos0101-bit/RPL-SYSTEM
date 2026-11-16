# Login reference design and local demo book

Date: 2026-11-13. User explicitly requests implementation, matching the supplied split-panel reference and adding a dummy book. Preserve previous forest/brass direction and existing functionality.

## Design
- Both /user/login and /librarian/login use the same shared component.
- Full-viewport generated bookshelf photo, intentionally dark green overlay like the reference; original RPL seal/name at top, centered rounded two-column card and small existing copyright footer.
- Left: rich dark forest #0F2821/#153E35 form, cream text, existing role label, serif Welcome back heading, existing Password/Face ID selectors, Identity Verification System divider, existing identifier/password inputs, eye toggle, member-only recovery link, brass Sign in action with dark text.
- Right: warm brass panel with centered RPL identity, role-specific existing account-access guidance, existing back-to-portal link styled as outlined CTA, existing library mission statement. Keep member registration in person and staff access administrator-issued. No social providers, Remember me state, signup routes, demo-login bypass, or invented quotations.
- Mobile: form first, access panel follows; all content remains available. Inputs >=16px, visible focus, text reflow at 200%, no horizontal overflow, content scrolls on short viewports. Keep camera constraints, polling, matching, role checks and routing byte-equivalent. Preserve camera cleanup behavior via existing component/effects; use only synthetic video for visual testing.
- Use new scoped frontend/src/styles/auth.css imported by index.css. Do not restyle other routes or alter saved theme state. The photographic dark login treatment is the reference design in both appearance preferences.
- Generated background source is separate from the UI. Prefer pixel-identical WebP encoding; no rasterized form/labels.

## Local sample data
The latest user request explicitly authorizes one persisted dummy book, overriding the earlier design-only/no-demo-data limit for this local record only. Add The Quiet Garden (Demo), author RPL Design Preview, category Mystery, one copy, DEMO-01 shelf, no fabricated ISBN. Record source other with a local-demo acquisition reference through the existing inventory API. Create a generated cover marked SAMPLE BOOK/LOCAL DEMO ONLY. Verify development environment, exact isolated SQLite target and local storage before any write. Use the existing local librarian account privately, a persisted idempotency UUID and receipt; never print credentials/tokens or infer an unknown write from a matching title. Upload cover via the existing authenticated route. Do not run the broad seed.py script, create users, touch production, migrate, or change backend code. Leave all existing records and physical-copy identities intact.

## Verification
Preserve baseline; AST-compare all login hooks/business logic and existing event handlers, plus webcam props. Build/credential scan, changed JSX lint and existing frontend helper tests. Browser-check member/staff layout, password visibility, validation, loading/error, role payloads/rejection, recovery/back destinations, synthetic Face ID tab and track cleanup, desktop/mobile/200% text/reduced motion. Test the real local dummy cover/details and confirm one copy/QR association. Browser plugin first; use the previously verified isolated Chrome fallback if still unavailable. Compare generated concept and rendered screenshots. No production deploy or commit.


## Implemented fidelity ledger

The supplied user reference establishes the dark bookshelf backdrop and rounded
split card. The generated RPL adaptation is the concept at
`.tools/login-design/art/login-concept.png` (1586 x 992). Root inspected that
concept and final Chrome captures with `view_image` in the same QA pass. Final
reference captures are `.tools/login-design/art/login-member-render.png`,
`login-librarian-render.png`, `login-mobile-render.png` and
`catalog-demo-render.png`.

| Comparison | Concept/reference evidence | Final render and intentional decisions |
| --- | --- | --- |
| Composition | Library shelves behind a rounded two-column card. | Generated local shelves, forest form on left, brass guidance on right, subtle outline and soft shadow. Both roles verified at the concept's native 1586 x 992. |
| Copy and controls | Reference has Welcome back and account guidance. | Welcome back retained; the original role label, identifier/password labels, Password/Face ID methods and role-specific account guidance remain. Unsupported social providers or registration actions are not introduced. |
| Typography | Bookish serif display headings with readable controls. | Georgia headings and existing system sans controls; 16px inputs, responsive heading sizes and visible labels. |
| Palette and contrast | Forest/brass adaptation of the reference. | Deep green form, cream text, warm brass panel and action; dark green text on brass for contrast. Sampled normal-text pairs at least 4.89:1, field boundaries above 3:1. |
| Branding and imagery | Generated concept approximates the official seal. | Original RPL.png restored in header and panel. Separately generated real bookshelf artwork is decorative and contains no UI. |
| Spacing and containers | Large desktop split card. | Max-width 1100px card fits original controls and common laptop viewports. Practical 44px control targets and scrollable content replace literal raster sizing. |
| Mobile and motion | Same content with a quieter modern entrance. | Form stacks before guidance; narrow 320px/390px views and 200% root text reflow without horizontal overflow. Address/hours remain available on mobile. Reduced-motion mode disables entry, hover and scan/loading animation. |
| Functional state | Existing password and Face ID flows. | Loading/error/wrong-role states, visibility toggle and synthetic Face ID render within the same panel. Camera stops when switching away from Face ID or leaving the route, matching existing behavior. |

Above-the-fold copy audit: no unapproved provider, account, credential or product
claims were added. Existing system text remains, with the main heading presented
as Welcome back, the submit action as Sign in, and the existing Password/Face ID
selectors in the reference's paired-button position. Recovery remains member-only;
right-panel actions retain their existing portal/home destinations. The original
2025 copyright and original account policies were deliberately retained. No
material visual mismatches remain against the reference-derived concept after
these documented adaptations.

## Local demo verification

One title, The Quiet Garden (Demo), by RPL Design Preview, category Mystery,
year 2026, one available physical copy on shelf DEMO-01. Its generated cover is
marked SAMPLE BOOK and LOCAL DEMO ONLY. The normal idempotent inventory create,
cover upload, scoped acquisition history and physical-copy QR routes succeeded.
The isolated local server was launched only after validating development mode,
local storage and the exact `backend/rizal_library.local.db` target. A separate
read-only SQLite check confirmed the new book, cover reference, available copy
and matching inventory-write receipt in that exact file. Existing inventory
metadata was checked for unexpected changes. No broad seed script was run and no
other accounts, inventory, loans or reservations were created. Retained local
request/receipt files allow outcome recovery without guessing or duplicate writes.

## Checks actually run

- Production frontend build and build credential scan passed.
- Changed LoginPage.jsx ESLint passed; existing frontend helper tests: 83 passed.
- Source AST guard: role constants, hooks, state, business logic, all seven event
  bindings, Webcam capture props and link destinations unchanged. Dependency
  manifests and lockfile byte-identical. Previous landing/catalog/navigation
  behavior guard also passed all 35 event bindings.
- Thirteen grouped Chrome checks passed: both role layouts, native validation,
  password visibility, loading/error/wrong-role rejection, responsive/enlarged
  text/reduced motion, synthetic Face ID polling and tab/route cleanup, saved
  theme, actual demo cover/details/reservation-login destination, and no uncaught
  runtime or unexpected console errors.
- Browser connection reported no browser available, so isolated Playwright used
  installed Chrome. All camera images were generated by Chrome's fake device;
  no patron image, real camera frame or real credentials entered the browser QA.
- Independent source, contrast and visual review found no actionable issues.
- Safari and physical-device/PAD acceptance were not tested. Existing login has no
  explicit page-hide camera effect; this design task preserves that baseline and
  makes no claim of changing it. Backend suites were not repeated for untouched
  backend source. No schema, production environment, deployment, commit or push.
- Temporary browser captures and one-off QA harness outputs were removed after
  preserving the final design renders and this verification ledger. Source
  baselines and operational request/receipt records remain private local files.

## Generated asset provenance

Built-in Image Gen produced the reference-derived login concept, standalone
bookshelf image and sample cover. Generation briefs: adapt the supplied rounded
split-card composition to RPL forest/brass with existing Password/Face ID and
account-policy copy; create photorealistic walnut library shelves with vintage
forest/brown books and warm lighting, no people/logos/UI; create a forest-and-gold
engraved garden-gate book cover with SAMPLE BOOK, THE QUIET GARDEN, RPL DESIGN
PREVIEW and LOCAL DEMO ONLY text.

Source PNGs remain under `.tools/login-design/art/`. The final 1672 x 941
`frontend/public/images/library-shelves.webp` is 1,680,830 bytes. The uploaded
1024 x 1536 sample cover `.tools/login-design/art/sample-quiet-garden.webp` is
2,786,284 bytes, below the existing upload limit. Both WebPs were encoded losslessly
with decoded RGBA pixel equality verified; the images were not visually edited.
The dummy cover is served from the existing local public-cover upload category,
not private patron storage. No new runtime/image-generation dependency was added.
