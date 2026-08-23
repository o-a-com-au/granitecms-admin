# Session notes - 2026-08-23

Status snapshot for picking this back up.

## What's done, this session

**Wholesale rework of "the site is loading / unreachable" across every screen.** Pages, Menus, Media, Redirects, and both editor screens each used to handle this differently - three separate error shapes, five different loading treatments, no retry/diagnose/manage-sites affordance anywhere. Replaced with one shared `SiteStatusPanel` (`packages/web/src/site-status/SiteStatusPanel.tsx`), full-bleed, with actions where they're actually actionable.

Found and fixed along the way: `SiteNotFoundError` (thrown whenever a site ID isn't registered) carried no machine-readable `reason`, and `ContentBrowserPage`'s error parsing preferred the generic `error` field over the real `message` - between the two, a deleted site literally showed the text "SiteNotFoundError" on screen. Every screen now shows one consistent message ("This site could not be found. It may have been removed.") with a Manage Sites action.

The Editor specifically: the sidebar isn't mounted at all while there's nothing real to show yet - one full-width panel fills the whole shell, sidebar slides in via a CSS mount animation once content arrives. Loading no longer shows text at all - a thin animated bar (`TopLoadingBar`) appears across the top of the viewport, only once a load has genuinely taken longer than 300ms.

AppShell's top nav: hides entirely (not per-item-disabled) with zero sites, refreshes its own site list whenever the route's `siteId` changes (it's a persistent layout that never remounts, so it previously missed a brand new site until a full reload), and is centred against the whole bar via absolute positioning rather than `flex: 1` (which used to visibly shift depending on whether the device-size toggle was present).

Commits: `59407de` (test isolation, see below), `471b03c` (this work), `2e4764a` (onboarding, see below). Pushed.

**New bare first-run onboarding screen at `/onboarding`.** A developer with zero sites used to land on the same Settings > Manage Sites screen a returning developer sees adding a second site. Now a dedicated route - no Settings sidebar, two steps (site URL, then the API token with room for instructions), each fading in. `HomeRedirect` sends a developer with no sites here; navigating Settings > Manage Sites on purpose always shows the normal registry view instead, even empty - these are deliberately different destinations for what used to be the same route.

Real bug found via this flow: `HomeRedirect` trusted `readLastSiteId()` blindly, with no way to know a remembered site had since been deleted (another tab, a local dev reset) - sent a returning visitor straight into a doomed `/sites/:id/editor` instead of back to onboarding. Now validates against a fresh fetch of the real registry first.

**Test isolation fix.** `npm test`'s `postgres-store.test.ts` truncates `users`/`sites`/etc as its own setup, and `redis-session-store.test.ts` deletes every `session:*` key - both were pointed at the same local Postgres/Redis a locally-running dev server also uses, so running tests kept wiping real dev data (the admin account, site registration) out from under active manual testing, repeatedly, mid-session. Test script now points at a separate `cms_admin_test` database and Redis logical DB 1, auto-provisioned on a fresh `docker compose up -d` (`docker/postgres-init/`).

All three pushed to `origin/main`.

## Known gotchas, still true

- **Backgrounded dev processes (the admin server, the delay-proxy) don't reliably survive between tool calls in this environment** - the server process got a stray `SIGTERM` and sat idle (in `--watch` mode, a signal doesn't trigger a restart, only a file change does) twice this session, with no code or data cause. If login suddenly stops working with the account still present in Postgres, check `lsof -ti:4278` first before assuming a data problem.
- **Token generation has no self-service story.** A site's API token is only ever shown once, printed to the terminal when `npx create-site <dir>` first scaffolds it (agent repo). Recovering a lost one means hand-computing a SHA-256 hash and editing `site.config.json` directly, then restarting the site's server. The onboarding screen's step 2 copy is deliberately generic about this rather than implying a self-service flow that doesn't exist - worth a real fix if it becomes a support burden.
- The admin's own site-fetch timeout is hardcoded at 4 seconds (`packages/server/src/sites/fetch-site.ts`'s `DEFAULT_TIMEOUT_MS`) - a delay proxy or slow real host past that reads as "unreachable" even though it would have succeeded slightly slower.

## Loose ends / possible next steps

- The two-step onboarding form's token-instructions copy is intentionally generic (see above) - revisit if/when there's a real answer for token recovery.
- `docker/postgres-init/` only runs on a *fresh* Postgres volume - anyone with an existing local `cms-admin-postgres` volume from before this fix needs to create `cms_admin_test` manually once (`createdb -U admin cms_admin_test` against the running container, then `DATABASE_URL=postgres://admin:admin@localhost:5432/cms_admin_test npm run db:migrate --workspace packages/server`).
