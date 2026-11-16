# Profile and public preview implementation plan

> Use superpowers:executing-plans inline. One required builder check and one final fresh source review; no implementer delegation.

**Goal:** Locked member names, optional add/remove avatar controls, and a uniform public book viewer without its lower slider.
**Architecture:** Existing FastAPI locked identity endpoints/private storage helpers; current React profile notifications and established member viewer layout. No schema/dependency change.
**Spec:** [Design](../specs/2026-11-16-profile-public-revision-design.md)

- [x] Save scoped baselines and builder-check the concrete design.
- [x] Add failing backend cases for name mutation and own-avatar removal, then implement the server guard and service/endpoint with existing locks/private-file checks.
- [x] Verify auth, contact/profile, upload/cloud and member-deletion regressions on isolated fixtures.
- [x] Update profile read-only field/payload and add/remove photo UI with pending guard and profile-patch publication; prove via synthetic browser cases.
- [x] Reproduce the public viewer size/slider problem, apply fixed geometry with contained covers and visible mobile arrows, then verify roles/navigation, long details and responsive sizes.
- [x] Run scoped lint/build, preservation checks and fresh review; document actual checks/limits, clean temporary QA safely and restart only the verified local API with migrations disabled.

Completed locally on November 16, 2026. See [verification](../specs/2026-11-16-profile-public-revision-verification.md) for actual results and remaining limits.
