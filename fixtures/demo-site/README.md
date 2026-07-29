# Demo site fixture

A real theme and content set, used for manual "does this actually work" demos
and live end-to-end verification of Phase 3 groups against a real running
`@oa/cms-agent` instance - not the automated `npm test` suites, which keep
their own small, disposable per-test fixtures.

This directory is the tracked, immutable template. It has no `.git` of its
own on purpose: a real site must be its own git repository (publish creates a
commit inside it), and if that lived inside this repo's own working tree, git
would hit an "embedded repository" problem the moment anything tried to
`git add` a path under it. Instead:

- `npm run demo:setup` copies this template into `.demo-runtime/` (gitignored,
  at the repo root), `git init`s it there, and builds + packs + installs the
  sibling `@oa/cms-agent` package from `../app-granite-cms` into it. Safe to
  re-run any time you want the demo running the latest agent code - it only
  recreates `.demo-runtime` if missing.
- `npm run demo:reset` wipes `.demo-runtime` first, so you get a clean copy of
  this template again (useful after a lot of test drafts/publishes have piled
  up and you want to start over).
- `npm run demo:start` runs the resulting instance at `http://localhost:3891`.

## Registering it in the admin

- Site URL: `http://localhost:3891`
- API token: `1f6157d9db9053c68d376d606c72cc0e805a33915a3854194ded79d52f03355a`

This token is a local-only development credential with no other purpose -
only `site.config.json`'s sha256 hash of it is ever stored anywhere, the same
as every other demo credential shown in plaintext throughout this project's
own development sessions.

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
