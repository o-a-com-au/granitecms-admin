# Demo site fixture

A real theme and content set, used for manual "does this actually work" demos
and live end-to-end verification of Phase 3 groups against a real running
`@o-a/cms-agent` instance - not the automated `npm test` suites, which keep
their own small, disposable per-test fixtures.

This directory is the tracked, immutable template. It has no `.git` of its
own on purpose: a real site must be its own git repository (publish creates a
commit inside it), and if that lived inside this repo's own working tree, git
would hit an "embedded repository" problem the moment anything tried to
`git add` a path under it. Instead:

- `npm run demo:setup` copies this template into `.demo-runtime/` (gitignored,
  at the repo root), `git init`s it there, and builds + packs + installs the
  sibling `@o-a/cms-agent` package from `../app-granite-cms` into it. Safe to
  re-run any time you want the demo running the latest agent code - it only
  recreates `.demo-runtime` if missing.
- `npm run demo:reset` wipes `.demo-runtime` first, so you get a clean copy of
  this template again (useful after a lot of test drafts/publishes have piled
  up and you want to start over).
- `npm run demo:start` runs the resulting instance at `http://localhost:3891`.

## Registering it in the admin

- Site URL: `http://localhost:3891`
- API token: printed to your terminal by `npm run demo:setup` the first time
  it creates `.demo-runtime` (via `mint-token` - see the sibling agent repo's
  `docs/hosting.md`). Not committed anywhere: this tracked template's own
  `vhost/site.config.json` ships with an empty `tokens` array, and a fresh
  token is minted per developer instead of every clone of this repo sharing
  one static, publicly-known credential.
- Lost it, or need another one? `.demo-runtime/vhost/node_modules/.bin/mint-token .demo-runtime`
  mints a new one against the already-running demo without disturbing
  whichever token you're currently using in the admin.

## What's in here

- `pages/index.json` (live) and `drafts/pages/index.json` - a deliberate,
  realistic draft edit to the homepage's hero copy, differing from live, kept
  here on purpose so the editor always has a real draft-vs-live page to demo
  or test publish/discard against with no extra setup.
- `pages/404.json` - has no draft, for exercising the live-only fallback path.
- `menus/*.json` - has no public URL, for exercising the no-preview-available
  path.

If the agent repo's own theme/content shape changes in a way that breaks
this fixture, restarting the agent process (`demo:setup` or `demo:start`)
after the fixture is updated is all that's needed - the agent compiles theme
templates once at boot, so a theme swap always needs a restart to take
effect; content changes alone don't.
