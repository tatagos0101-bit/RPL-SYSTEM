# Login Redesign and Local Demo Book Implementation Plan

1. Preserve source baseline, read existing login/inventory behavior, establish complete reference-derived login concept plus bookshelf and dummy-cover assets.
2. Review the design constraints. Implement LoginPage presentation and auth.css with all hooks and handlers unchanged, retaining role-aware controls and original webcam properties.
3. Add one clearly marked local demo title through authenticated idempotent inventory creation, then validated cover upload. Confirm local SQLite/storage and retain request/receipt without credentials.
4. Run source/handler guard, frontend lint/build/tests, and isolated Chrome checks for login states and responsive/accessibility behavior. Check the persisted sample through the public catalog, without borrowing or creating accounts.
5. Perform independent implementation review, fix findings, compare concept/render, update relevant architecture/design notes and report URLs and checks.

Ownership: root handles JSX, index import, asset persistence, local inventory API operations and QA. A frontend worker may own only auth.css. No backend, API helper, manifest or existing public-page source changes are planned.

Completed locally. Product scope: LoginPage.jsx presentation, auth.css, index.css import and bookshelf asset. One explicitly requested local demo title/cover was persisted through existing APIs. All five steps completed; see the linked design specification for fidelity, checks and limits. No commit or deployment.
