# Public website redesign plan

November 13, 2026. Approved for implementation by the user and implemented locally.
Latest user steering supersedes the original palette/type placeholders below:
walnut brown + amber + warm paper; Newsreader headings with DM Sans interface
text, following the Bruvora typography reference; soft control corners and rounded
Sign in; login retains its original split layout AND bookshelf backdrop. UI/UX Pro
Max guidance was applied to spacing, reflow, focus clearance and effect cleanup.
See [implementation verification](2026-11-13-public-experience-revision-verification.md)
for evidence, adaptations and remaining limits.

The user wants a simpler design with less generic decoration, Vantara's modern
visual pacing, and a public catalog that closely matches the supplied Open Library
screenshots. Walnut brown and amber are the final chosen public colors. Existing
application functions remain unchanged.

## Recommended direction

Use large library imagery and restrained motion on the landing page. Use compact
category tiles and cover shelves in the catalog. Shared branding connects them;
the two pages deliberately use different amounts of space.

The alternatives considered were a compact catalog treatment everywhere, which
offers consistency, or large imagery throughout the public site, which gives more
space to library storytelling. The recommended combination matches both supplied
references and keeps browsing practical. It is a proposal, not an approved layout.

## 1. Make the public catalog match the screenshots

- Remove the large Explore the collection banner and decorative book render.
- Keep a compact header and search field, followed by Browse the stacks.
- Replace category pills with small rectangular tiles containing miniature cover
  collages and category names. Active tile: pale green, thin border, panel marker.
- Put the selected category inside a warm ivory bordered panel.
- Display cover-led horizontal shelves with approximately six to eight books
  visible on desktop and two plus a partial third on mobile.
- Keep covers around 190-210px tall, preserve their proportions and align the small
  View details actions beneath them. Titles/authors stay readable; availability
  must not cover the artwork.
- Use small headings, thin borders and 4-8px corner radii. Preserve search, actual
  category values, result totals, server pagination, empty/loading/retry states,
  book-detail navigation, keyboard focus and current role-specific actions.

Layout proposal:

    Library header                    Home / Catalog / Sign in
    [Search by title or author ______________________________]
    Browse the stacks
    [All books] [Category] [Category] [Category] ...
                  selected tile points to panel
    +------------------------------------------------------+
    | All books / selected category                        |
    | Result count                             < scroll >  |
    | [cover] [cover] [cover] [cover] [cover] [cover] ...     |
    | [View details actions aligned below the covers]      |
    | Existing page controls                               |
    +------------------------------------------------------+

The strip uses real API categories. Category names in the sketch are illustrative;
All is not renamed Featured. Cover collages use only already-loaded covers, with
neutral decorative spines/plain tiles when previews are unavailable. No extra
catalog downloads are added for decoration. The shelf displays the current server
page; horizontal scrolling must not change filters, page or reservation state.

The existing one-book local catalog remains honest. Full-density layout review
uses clearly labelled synthetic preview fixtures, without adding more inventory.

## 2. Give the landing page a modern, simpler composition

- Use one large, well-composed library photograph as the main visual. Prefer real,
  approved library imagery. A short muted video is optional later; the design is
  complete with a still image.
- Keep the existing headline, service copy and links. Make the headline readable
  over/beside the image and keep the search control available immediately.
- Preserve current landing-search behavior: submitting navigates to /browse; it
  does not currently forward the typed query. Changing that is separate work.
- Arrange existing service descriptions as simple image/text sections or ruled
  rows. Reduce ornamental arches, repeated numbered blocks and oversized gaps.
- Keep practical hours, contacts and catalog entry easy to find. Do not invent
  statistics, events, testimonials or new service claims. Existing address
  differences between pages require factual review separately, not a design guess.

## 3. Use a small set of deliberate animations

- Landing: one coordinated image/heading entrance, approximately 600ms.
- Scroll: a gentle bounded image reveal/movement and short section entrances.
- Navigation: quick color/underline/menu transitions.
- Catalog: selected-tile transition, a small cover hover response, and smooth
  user-controlled horizontal shelf scrolling with accessible arrows.

Keep native page scrolling and immediate input access. Motion must not duplicate
accessible headings or gate content. Mobile and reduced-motion views use static
imagery and instant state changes where appropriate. Optional video requires a
poster, pause control, no sound by default and no unnecessary mobile preload.
CSS and existing browser APIs are sufficient for the proposed motion; no new
animation dependency is assumed.

## 4. Keep the visual identity restrained

Walnut brown handles navigation, selection and primary actions. Warm paper/ivory
handles the page and shelf surfaces. Amber becomes a small accent. Replace broad
metallic gold fills with simpler surfaces.

Use characterful headings on the landing page and compact, readable catalog type.
Use Newsreader display headings with DM Sans body/controls and verify contrast in actual components.
Use original RPL branding and actual cover artwork. Do not copy reference-site
media or font files.

A later login consistency pass is proposed: retain the user's split-form layout and bookshelf backdrop,
reduce its oversized metallic treatment, and align typography/motion. All password,
Face ID, role, recovery, webcam and redirect behavior remains unchanged. Member
and librarian dashboards and the entrance station are outside this public-page
plan. Any palette changes in this pass must stay scoped to the relevant public
pages, preserving unrelated screens and existing saved theme behavior.

## Existing behavior limits

Source reviewed: LandingPage.jsx, PublicBrowse.jsx, BookCard.jsx, Navbar.jsx,
frontend API helpers, backend/routers/books.py and category_service.py.

- The public list already supports title/author search, category filtering and
  pagination; ordering is title/id. Preserve its current query/page contract.
- Existing cover actions open the detail modal, with reservation/login behavior
  depending on role. Keep those actions; this system has no online Read/Listen
  service to copy from Open Library's buttons.
- The public catalog has no Featured/Books we love/Classics collection model,
  subgenre hierarchy, ratings or public sorting menu. Do not add dead controls or
  manufacture collections during a design-only pass.
- A global trending endpoint/helper exists, but PublicBrowse does not use it. Its
  last-30-day borrow ranking falls back to newest items, with no category filter
  or ranking-basis flag. Adding trending shelves is separate behavior work. Do not
  filter its limited global results and label them complete category trending.
- Use a public-only card variant/component so shared member/librarian cards do
  not change unexpectedly. Keep requests in existing API helpers; no backend,
  schema, authentication, circulation or inventory changes are planned.

## Delivery order

1. Prepare catalog and landing desktop/mobile mockups side by side with the
   supplied references. Include the selected category, search, empty and populated
   catalog states, plus a small storyboard showing the landing motion.
2. Review the visual direction before writing product code. The review should
   judge actual layout and content, rather than only a polished overview image.
3. Implement the catalog presentation first, then the landing composition.
4. Add the limited motion after both layouts work as static pages.
5. Apply the agreed login consistency pass afterward.
6. Compare rendered pages to the reviewed layouts and verify existing interactions.

## Acceptance checks for future implementation

Check desktop 1440/1280, tablet, mobile 390/320px, 200% text, both saved themes,
reduced motion, keyboard and touch. Books should appear in the catalog's first
viewport. Covers must load without distortion; intended horizontal shelves remain
contained and navigable without horizontal page overflow.

Check existing search/reset/category/page requests, retries, empty states, detail
modal Escape/focus/previous/next/swipe and reservation/login destinations. Preserve
function bindings, routes, role conditions and camera configuration. Use synthetic
fixtures and fake camera media, never private patron data or real credentials.

Run the production build/credential scan, lint changed JSX and existing helper
tests when implementing. No application suites were run during the initial planning stage. Final
implementation checks are recorded in the linked verification notes. A fresh independent read-only builder check found no important open design
questions or incorrect source claims; its wording clarification about landing
search has been incorporated. Exact media, type sizes, colors and login treatment
remain proposals for visual review.

## Reference review

[Vantara](https://vantara.in/en) was inspected live at 1440 x 1000, including its
moving-image opening and scrolled photo/text section. [Open Library](https://openlibrary.org/)
was inspected at the same viewport; the user's two screenshots remain the priority
reference for category tiles, attached panel and cover rows.

The in-app Browser reported no available browser, so read-only Playwright used
installed Chrome. Reference captures were inspected with view_image and removed
after recording observations. No dependencies were installed. Git status was
attempted, but the workspace has no Git metadata. No commit, deployment or data
write was performed for this plan.
