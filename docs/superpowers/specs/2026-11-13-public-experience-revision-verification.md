# Public experience revision: implementation and verification

November 13, 2026. Implemented locally after user approval. This record incorporates
subsequent user instructions: walnut brown/amber, the Bruvora typography reference,
rounded controls, UI/UX Pro Max, and keeping the existing login layout/backdrop.

## Result and scope

- Public landing: real locally served photography, readable large heading/search,
  simple service rows/footer, short entrances and bounded native-scroll image motion.
- Public catalog: small category cover collages, selected marker, ivory panel,
  natural-proportion cover shelf, persistent detail action and local scroll arrows.
- Login: original shared JSX, split geometry and bookshelf backdrop; CSS-only
  walnut/matte-paper/amber treatment, new type and rounded Sign in.
- Self-hosted Newsreader headings and DM Sans body/controls, with SIL OFL files in
  frontend/public/fonts. No package/environment/schema/backend changes.
- Existing queries, auth, role conditions, camera configuration, modal handlers,
  pagination and reservation destinations are preserved. No inventory writes.

Changed code: LandingPage.jsx, PublicBrowse.jsx, discovery.css, auth.css, and new
public/BookShelf.jsx and CatalogBookCard.jsx. Navbar.jsx, LoginPage.jsx, shared
BookCard/BookCover, index.css and dependency manifests match their exact baselines.
Protected dashboards keep their existing styles. The public drawer receives the
same local palette/type via the public-navigation sibling selector.

## Reference and fidelity review

Authority: [approved plan](2026-11-13-public-experience-revision-design.md), the user
screenshots, [Vantara](https://vantara.in/en), [Open Library](https://openlibrary.org/)
and later steering. [Bruvora's typography article](https://www.bruvora.com/blog/stop-ai-slop-typography)
informed contrasting display/UI families, hierarchy and intentional spacing; the
specific Newsreader/DM Sans pairing is our implementation choice.

Built-in Image Gen created these complete local layout studies:
`.tools/public-revision/art/landing-concept.png` (1536x1024),
`continuation-concept.png` and `catalog-concept.png` (1487x1058 each).
The flat-background login-concept.png is an unused study: later user steering
explicitly retained the original split login and bookshelf setting. Its active
reference is the prior `.tools/login-design/art/login-member-render.png`.
The generated forest palette/Georgia approximations were superseded by the user's
walnut, typography and rounded-control instructions, not silently reinterpreted.

Final renders are under `.tools/public-revision/art/final/`. Root used view_image
on all relevant concepts/original login and latest actual renders in the same
final review pass. Native landing1536x1024 and catalog/continuation/login1487x1058
were checked, plus mobile390/320 and tablet/laptop820/1024/1280. No material visual
mismatches remain after the documented user-directed adaptations.

| Comparison | Evidence and final decision |
| --- | --- |
| Composition | Full photographic landing opening and image/text service continuation; compact catalog begins with search/categories and visible covers. Original login split remains. |
| Density | Seven full desktop cover cards plus part of the next; small category collages and contained mobile shelves. Actual API categories/current page replace the concept's illustrative collection. |
| Palette | Latest user walnut #513728, warm paper #FAF7F0, ivory shelf #F3EBDD and amber accents. Matte login guidance replaces metallic gradients. |
| Type | Newsreader display and DM Sans UI are loaded from local files. Controls remain deliberately small/readable, input text16px, with clearer display hierarchy and reflow at200% text. |
| Corners | User-requested rounded Sign in, softened fields/search/category tiles/panel, circular rail arrows. Physical covers keep natural proportions. |
| Assets | Original RPL seal restored instead of generated approximations. Actual licensed photos are used directly, with a neutral lower fade for hero text. Real cover art stays API data, with shared no-cover fallback. |
| Copy | Existing hero/service/contact/account wording and destinations remain. Approved Browse the stacks/All books labels replace oversized banner/pills. Photo credits are added. No new rank, self-signup, metrics or product claims. |
| Motion | Short entry/service reveals and actual scroll-linked image scale verified in Chrome; reduced-motion views are static and native scrolling remains in control. |
| State and focus | Existing loading/error/role/modal states render in the same components. New rail only scrolls the current viewport; pagination controls keep their component/DOM identity. |

Above-the-fold copy audit: passed against existing JSX plus approved category/
shelf labels. Removed the former Public catalog/Explore the collection banner
and decorative numbered labels as planned. Original branding, account policies,
2025 copyright and real library contact details remain. No invented Featured,
Trending in category, ratings, online Read/Listen or unsupported sorting controls.

## Checks actually run

- Production build and build credential scan passed; changed JSX ESLint passed.
- Existing frontend helper tests: 83 passed,0 failed.
- Source AST guard: original hooks/state/business prefixes and all42 event bindings
  unchanged; protected shared files and manifests byte-identical.
- Chrome:16 grouped public/login checks plus4 focused tablet/motion/theme/camera
  checks passed. No uncaught runtime or unexpected console errors in the full run.
- Catalog: native scrolling/arrows/keyboard, no extra queries on viewport scroll,
  skip/limit/category/search contracts, clearing/reset, paging, range/arrow/modal
  Escape/focus restoration, retries/empty states and role-specific link destinations.
- Responsive:390/320px,200% root text, category-label text bounds, contained shelves,
  font loading, mobile photo source, both themes and reduced motion. Additional
  focused checks verified that mobile Sign in keeps its accessible name/route and
  touch views use static hero imagery.
- Login: both roles, visibility toggle, synthetic loading/error, role request fields,
  fake-camera polling and track release on tab changes and route unmount. No real
  credentials or patron frames entered captures or external services.
- UI/UX Pro Max verified queries: touch target spacing/reflow, focus not obscured,
  and React effect cleanup. Applied8px arrow gaps, content-driven text layout,
  local focus scroll margins and cleanup of rail listeners/ResizeObserver/rAF.
- Sampled normal-text contrast pairs passed: main13.8:1, secondary5.57:1,
  dark action4.9:1, login guidance7.81:1 and Sign in5.92:1.
- Browser plugin connection reported No browser is available; isolated Playwright
  with installed Chrome was the approved fallback. No browser package was added.

Independent source review raised one component-key accessibility issue and a
category-label zoom concern. Root removed the shelf's page-dependent React key
and resets only track.scrollLeft via resetKey; browser confirms pagination DOM
stays connected across updates. Label-bound checks reproduced Romance overflow
at200%; wrapping fixes passed. Further QA measured landing text overflow and a
static view timeline; heading/grid reflow and overflow:clip fixed both exact checks.

## Preserved baseline and remaining limits

- useServerPage stores one keyed page. Returning to an earlier All query can
  restore its previous page; reset/filter expectations were checked against that
  source behavior, not silently changed to a new pagination policy.
- The unchanged shared PageControls disables buttons during loading/at the last
  page. An isolated mount confirmed native disabled-button focus can move to body
  while the same DOM node stays mounted. This design fixes the new remount, not
  the pre-existing shared-control policy.
- Review deliberately set aside unchanged modal placeholder URL, unnamed range
  control and inconsistent availability-string comparisons. No incidental fixes.
- Existing login has no explicit page-hide camera effect. Route/tab cleanup was
  checked, but no new lifecycle behavior or physical/PAD acceptance is claimed.
- Safari and physical devices/cameras were not tested. Unsupported scroll-timeline
  browsers retain visible static content. Backend suites were not repeated for
  untouched backend code. No measured LCP/CLS or official accessibility certification.
- The local preview was started only after validating the exact existing local
  SQLite target and local storage, with startup AUTO_MIGRATE=false for that process.
  New inventory appeared during work; QA preserved it and checked the existing demo
  specifically. Real-data requests were independently confirmed to remain local.
- No deployment, commit, push, production resource change, migration or data write.
  This downloaded workspace lacks Git metadata; exact source baselines remain local.

## Asset and concept provenance

Runtime photo sources and license links are in
[photography credits](../../../frontend/public/images/CREDITS.md). Clay Banks image:
346608-byte desktop/119542-byte mobile WebP; Denise Jans:222670-byte WebP. These
illustrate a library setting, not the RPL building. Source images were downloaded
as official resized WebP renditions and were not synthetically edited.

Newsreader and DM Sans are official Google Fonts downloads, self-hosted with their
OFL licenses:132000 and36932 bytes respectively. Their font URLs are local, not
third-party runtime requests. Existing inventory artwork and original login
bookshelf background retain their previous provenance.

Image Gen prompt set (condensed; these are layout studies, not shipped UI):
1. RPL desktop1536-ish opening: exact supplied library-window photo, compact RPL
   header and existing nav, existing Discover your next great read copy, working
   search layout/links, slim unnumbered four-step strip; no invented claims/cards.
2. Coordinated service/footer screen: supplied reading-room photo left, exact three
   existing service descriptions in ruled rows right, original practical footer and
   photo credits, same spacing/type system, no invented sections or data.
3. Full compact catalog: Open Library-style cover-collage category tiles, selected
   marker and ivory shelf panel, seven visible natural-proportion covers and detail
   actions, title/page controls; fictional preview titles only, no invented ranks.
4. Complete split member login study: existing method selectors/form/account copy,
   calm neutral guidance, no providers or demo bypass. The proposed flat background
   was discarded when the user requested the original bookshelf setting.

The real website is native JSX/CSS/Lucide UI. No concept screenshot is used as a
form, book list or navigation surface. Final design renders are retained as review
deliverables; temporary QA scripts/captures were removed after this record.
