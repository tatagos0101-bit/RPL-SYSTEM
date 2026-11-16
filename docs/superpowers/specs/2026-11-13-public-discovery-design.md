# Public discovery design

Date: 2026-11-13. Status: authorized forest/brass direction and implementation request; implementation concepts document the chosen interpretation.

## Intent
Refresh the public landing page `/` and public catalog `/browse` with an inviting, contemporary physical-library identity. The user selected forest green and brass and requested Open Library-inspired discovery and modern animation. Earlier restrictions remain: design only, preserve application functionality.

## Approach
Use Open Library's book-first hierarchy, prominent search, subject browsing, and restrained editorial rhythm within RPL's existing React components. A literal copy would introduce unsupported online-reading/contribution workflows. A dark marketing-first layout would reduce collection readability. Choose parchment surfaces, forest navigation/actions, brass accents, serif display headings, and quiet cover-forward composition.

## Visual specification
- Palette: forest #153E35, brass #C7A15A, parchment #F5F0E6, ink #1C2924, paper #FFFDFA. Retain distinct success, warning, and error meanings. Support existing light/dark preference. The original request explicitly authorizes changing the color of the whole system: shared palette tokens change globally, while new geometry, typography and motion are scoped to the two public routes.
- Heading font: Georgia/Times serif; UI/body: existing Segoe UI/Arial. No new font dependency or remote font requests.
- Header: existing seal and RPL name, current menu/theme/auth controls, direct Home/Catalog links to existing routes on desktop.
- Landing: two-column editorial hero, unchanged headline/body/search/links, generated decorative vintage-book still life; four existing reading-journey steps; three existing service descriptions as open editorial columns; existing contact/location/privacy footer in forest green.
- Catalog: compact editorial heading, existing search and server-provided categories in a sticky paper toolbar, existing cover-first grid, pagination and result count. Present actual empty/error/loading states honestly. No seeded or invented collection data.
- Details: preserve all modal content, controls, keyboard/swipe behavior, reservation destinations, and role visibility. Apply presentation through scoped styles.
- Motion: short staggered entrance, subtle cover/image lift and button transitions; progressive CSS scroll reveals. No animation dependency, forced scrolling, automatic carousel, or background polling. Respect reduced motion and keep text visible when animation is unavailable.
- Mobile: retain the accessible existing header/menu; stack hero, keep search usable, journey steps become two columns, services one column, categories horizontally scroll without page overflow; catalog two columns.
- Imagery: generated generic books, no patron imagery or fake inventory. Existing RPL logo remains untouched. Concept images in .tools/design-concepts; production book cutout in frontend/public/images.

## Functional boundaries
Do not modify hooks, API helpers, endpoint/query parameters, authentication, routes, role checks, reservation policy, camera behavior, database or data. Landing search currently navigates to `/browse` without forwarding its typed query; preserve that behavior during this design-only change. Existing PublicBrowse server pagination uses page size 100. Keep recovery and retry actions.

## Verification and limits
Build and credential scan, existing frontend helper tests, lint changed JSX, compare functional component prefixes and event-handler AST against source baseline, browser checks at desktop/mobile and both themes. Use anonymous local requests and synthetic intercepted catalog responses for populated, loading/error, filtering, modal and pagination checks, without persisting data. Browser plugin first; it currently reports no browser, so standalone Playwright with installed Chrome is the verification fallback. Compare generated section concepts against screenshots; note deviations. No backend test run is required for untouched backend code. No production deployment.

## Implemented comparison and verification

The three local concept references are `.tools/design-concepts/landing.png`,
`continuation.png`, and `catalog.png`. The final Chrome screenshots are in
`C:/Users/USER/AppData/Local/Temp/rpl-public-discovery-SgC0jE/`.
Concepts and latest screenshots were inspected with view_image in the same QA pass
at the concepts' native 1487 x 1058 dimensions, plus 390 x 844 and 320 x 740 mobile
checks. An independent review also checked 1120px and enlarged text.

| Comparison | Rendered evidence and decision |
| --- | --- |
| Composition | Two-column hero, realistic book still life and outlined arch; ruled four-step strip; open services and forest footer. Mobile stacks the same content. |
| Copy | Hero headline, paragraph, Search, Browse collection and Member login match the source/brief. Existing service/contact/privacy copy is retained; Home/Catalog are the briefed links to existing destinations. No extra hero badge, metric or product claim. |
| Palette | Forest #153E35, parchment #F5F0E6 and brass details; darker brass for readable text on paper, cream foregrounds in dark mode, semantic status meanings retained. |
| Typography | Georgia display headings and existing Segoe UI/Arial controls. Native sizes adapt to the existing 64/112px header contract and practical 16px search fields rather than reproducing raster text sizing literally. |
| Imagery | Generated three-book still life extracted from the hero concept, real alpha, pixel-identical lossless WebP. Catalog reuses it as desktop-only decoration. Real book covers remain API data. |
| Icons | Existing Lucide outline icons retained, with matching arrow/search treatment and visible keyboard focus. Original RPL seal preserved instead of the concept's approximate logo. |
| Density and controls | Six desktop/two mobile catalog columns when inventory is present. Original category/Out badges, result wording and both pagination controls retained instead of inventing the concept's availability chips or numbered pagination. |
| Motion and mobile | Short entrance and hover/scroll reveals; reduced motion leaves content visible. Larger text reflows without headline clipping; hidden mobile catalog art makes no network request. |

The local catalog was empty during this verification. Populated screenshots
used intercepted synthetic responses in an isolated test browser; this task
created no books or patron records. The subsequent explicitly requested
[login/demo task](2026-11-13-login-design.md) added one local dummy title.
The modal retained native dialog, Escape/focus restoration, arrow/swipe behavior,
existing reservation URLs and librarian/member/anonymous presentation.

Checks actually run after fixes:
- Production build and frontend credential scan passed.
- Existing frontend helper tests: 83 passed, 0 failed.
- ESLint on the three changed JSX files passed.
- Source AST comparison: component hooks/state/business logic and all 35 event
  bindings unchanged; dependency manifests and lockfile byte-identical.
- Chrome: 16 full public-page checks plus 5 focused accessibility/asset checks passed.
- Independent review: no remaining findings. Safari and physical devices were not
  tested. The Browser connection reported no available browser; Playwright used
  installed Chrome with isolated profiles as fallback.
- Both public URLs and the unchanged local API health endpoint returned HTTP 200.
- Backend suites were not repeated for this presentation-only change. No schema,
  production configuration, deployment, commit or push was performed.

During QA, the old Vite process served cached pre-change CSS. Its verified local
frontend process was refreshed and local file polling enabled. Final checks
explicitly assert that discovery CSS and the new palette are rendered.

## Generated asset provenance

Built-in Image Gen was used for the three coordinated section concepts and the
book-art extraction. The final production asset is
`frontend/public/images/heritage-books.webp`; its source PNG remains under ignored
`.tools/design-concepts/heritage-books-source.png`. The WebP is 1,485,882 bytes,
36.7% smaller than the 2,347,274-byte PNG, with identical decoded RGBA pixels.

Final extraction prompt (the referenced image was the generated landing concept):

> Create the standalone production image asset from this website concept. Keep ONLY the exact photorealistic still life at the right: one tall upright worn forest-green clothbound book, one slightly smaller upright natural parchment/tan clothbound book, and one horizontal aged walnut/brass-brown book lying in front, resting on a low pale cream stone pedestal with fine natural grain. Preserve the books' vintage material, relative heights, composition and warm soft studio lighting from the reference as faithfully as possible. Remove ALL website UI, text, logo, search field, journey strip, lines and arches. No readable book titles, author names, typography or marks. Isolate books AND full pedestal onto an actual transparent alpha background; preserve a subtle natural ground contact shadow. Show the whole pedestal with clean complete left and right edges and generous transparent margins, no clipping. This must be a realistic quiet archival library still-life cutout usable on both parchment and dark forest website backgrounds, no colored tint or overlay. Do not create a website screenshot.
