# Completed-work repository handoff — October 25, 2026

The operator requested committing completed work to main and deploying it while
preserving unfinished implementations. The review started from main
`03525120ad49e862ec84dfc70fc518fa34d0333f`. Recommendation, earlier security,
frontend-credential cleanup and UI branch commits were already ancestors of main.
No additional completed application feature was waiting in those branches.

## Included

- Update the protected database candidate checker from the historical 14-table
  baseline to the current 16-table contract and correct its imported artifact path.
- Preserve the protected synthetic workflow and full-API/Storage acceptance tools
  and their guard tests under root `scripts/`. These are operational test tools,
  not application endpoints. Do not copy or mount them in a public release.
- Record the live restricted-account switch, owner-variable cleanup, operator's
  private password reset and successful post-reset checks. Document integration
  reinjection and the separate maintenance-credential requirement.
- Reconcile completed/open security items and correct obsolete repair-release and
  owner-connection setup instructions.

No backend/frontend application source, dependencies, schema, PAD or Redis
configuration is changed by this handoff. Pending work in other worktrees and
the untracked UI image are excluded. Secrets, local environment exports, images,
database records, ignored operational state and backup archives are not included.

## Validation and release boundary

All **76 focused database-checker/probe tests passed** again before the commit.
Only the existing Starlette/httpx and AnyIO deprecation warnings were reported.
The preceding post-reset cloud acceptance passed actual restricted pooler identity,
all 16 table permissions, synthetic API workflows, Storage privacy/upload/cleanup,
and public API/website-rewrite health/access checks. See
[owner retirement evidence](OWNER_CREDENTIAL_RETIREMENT.md) for exact deployment IDs
and the limits of operator-confirmed password invalidation.

The release candidate must use the resulting main commit with application files
identical to the tested `0352512` source. Root operational probes must remain outside
the backend artifact; all diagnostic routes must return 404. Preserve the restricted
Production database URI, zero `POSTGRES_*` project variables, existing Storage
configuration and `AUTO_MIGRATE=false`. No migration is required. Verify public
health/access and unchanged unrelated work after deployment. Future integration
resets/syncs still require a check for recreated owner credentials.
