# Inactive account review implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for separate backend/frontend ownership and one fresh final review.

**Goal:** Automatic six-month inactivity notices, a 72-hour reply window, and librarian-approved deletion with explicit manual override.
**Architecture:** Private notice state, read-only activity aggregation, existing authentication/delivery/deletion safeguards, protected periodic notice processing, scoped staff/member UI.
**Tech stack:** Existing FastAPI/SQLAlchemy/Python, React/JSX/Axios, Supabase PostgreSQL/Cron/Vault.
**Spec:** [Approved behavior and API contract](../specs/2026-11-21-account-inactivity-design.md).

## Global constraints

- Six calendar months, 72 hours, no automatic deletion. Keep existing manual deletion password/loan/privacy checks.
- One pending notice per member; new activity/reply prevents approval and resets inactivity.
- Every notice is in-app; email first, otherwise optional existing Twilio, with truthful delivery outcomes.
- No patron data, credentials, real biometrics, or live transport calls in tests/artifacts.
- Additive migrations only; maintain RLS/browser revocations. No Supabase Auth or public DB access.

## Review focus

- Approvals racing with activity/replies or manual deletion must not delete a newly active account.
- Old sign-in history is incomplete; messages refer to recorded activity and future sign-ins are persisted.
- Provider failures/uncertain SMS outcomes cannot be reported as delivered or trigger duplicate sends.
- Caller retries/concurrent checks must not create duplicate pending notices or bypass the 72-hour gate.
- Production schema and protected scheduler must precede activation; the scheduler cannot delete anything.

## Tasks

- [ ] Read-only builder check of the spec and contract before product code; settle implementation issues without reopening approved policy.
- [ ] Backend owner: write failing lifecycle/API/migration tests; implement notice model/schema, activity, delivery, protected routes and approval integration. Preserve existing manual delete. Run focused regressions.
- [ ] Frontend owner: implement review-first Delete Account flow, notice queue/check action, explicit existing manual delete, member Keep action in notification/profile surfaces, API helpers; synthetic desktop/mobile browser acceptance.
- [ ] Root: validate migrations on isolated targets, create reviewed scheduler setup SQL with Vault-generated key and restricted queues, update architecture/deployment policy docs and verify package boundaries.
- [ ] Full relevant suites, lint/build, rendered QA; one fresh review of the integrated branch and focused fixes.
- [ ] Merge reviewed work to main. Apply minimal additive production DDL and ACLs, publish backend then frontend, enable/verify scheduler without manually sending real patron notices, verify deployed public access boundaries. Record limitations honestly.

## Execution record

- Baseline: clean main at `d24ef38`; last backend run 477 passed/32 skipped, frontend 109 tests plus lint/build and browser acceptance passed. Isolated worktree under ignored `.tools/worktrees/account-inactivity-notices` on `updates/account-inactivity-notices` protects the running local checkout.
- Business policy was confirmed by user: six months; automatic activity-based notice, librarian approval for deletion; manual deletion anytime retained. No further policy confirmation is needed.
