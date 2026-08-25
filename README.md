# Granite CMS Admin

The control-plane application for [Granite CMS](https://github.com/o-a-com-au/granitecms)
sites: a site registry, a sidebar page editor with live preview, drafts and
publishing, section/block editing, page history and rollback, media, menus,
and redirects.

This is a separate codebase from the site engine (`granitecms`), with its
own deploy cycle. The only connection between the two is a registered
site's versioned `/v1/` HTTP API - this application never touches a site's
filesystem or git repository directly. A registered site's raw API token
never reaches the browser either: this server holds every site's token and
injects it server-side; the browser only ever authenticates against this
admin's own session.

## What's actually here

- **Site registry** - register a site by URL and API token, rotate tokens,
  see each site's live status and the engine version it's running.
- **Content browser** - an expandable page tree (not a flat list), search,
  and per-page status at a glance: Live, Draft only, or Live + draft
  pending.
- **Page editor** - sections and blocks arranged by drag-and-drop, a fields
  panel for whichever component is selected, and a live preview rendered
  by the real site, not an approximation.
- **New Page flow** - a title, a URL, and (when the site's theme defines
  any) a prebuilt template picker.
- **Drafts, preview, and publishing** - autosave to a draft, explicit
  publish, discard, unpublish, and a real conflict UI when two edits
  collide, built around the engine's own ETag/`If-Match` concurrency model.
- **Page history** - the engine's real git history, browsable and
  revertible with one click, with routine checkpoint commits hidden by
  default.
- **Media, menus, and redirects** - the rest of what a site needs day to
  day, none of it requiring any git or code knowledge to use.

## Running it locally

```
npm run dev:setup
```

Brings up Postgres and Redis (`docker-compose.yml`), waits for Postgres to
actually be ready, runs migrations, and starts both dev servers. Local
login: `admin` / `admin` (fixed for local development only - see
`scripts/dev-setup.sh` and `auth/bootstrap.ts`; never used for a real
deploy). The web app runs on `http://localhost:5173` and proxies `/api` to
the server on `http://localhost:4278`.

Want a real site to point it at while you work? See the sibling
`granitecms` repo's `create-site` command, or this repo's own
`npm run demo:setup` for a disposable demo fixture.

## Repository layout

```
packages/
  server/   Fastify API, auth, the Postgres/Redis-backed store, proxying to sites
  web/      React + Vite frontend
```

## Deploying

A plain Docker image (`Dockerfile` at the repo root) runs identically on
Fly, Railway, Render, ECS, or a bare VPS. See
[`docs/deployment.md`](docs/deployment.md) for required environment
variables and the manual migration step.

## Documentation

- [`docs/deployment.md`](docs/deployment.md) - environment variables, running migrations, deploying
- The sibling `granitecms` repo's `docs/cms-build-plan.md` - the architecture this admin is built against, including the full `/v1/` API contract

## Project status

Runs a real production site today (one so far, not thousands). Expect
rough edges and active development, not a finished product - issues and
feedback welcome.

## License

[Functional Source License, Version 1.1, Apache 2.0 Future Grant](LICENSE)
(FSL-1.1-ALv2) - free to use and self-host, restricted from being offered
as a competing hosted service, converting automatically to Apache 2.0 two
years after each version's own release.
