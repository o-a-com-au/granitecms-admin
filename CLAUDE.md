# CLAUDE.md - cms-agent-admin

## What this project is

The control-plane admin application for `@oa/cms-agent` sites: a site registry, sidebar editor, live preview, publish/discard controls, page history, and section/block editing, all driven by calling each registered site's versioned `/v1/` HTTP API.

This repo has no build plan of its own. `../app-granite-cms/docs/cms-build-plan.md` and `../app-granite-cms/docs/phase-3-checklist.md` (in the sibling agent repo) are the source of truth for what gets built here, in what order, and why. Read the relevant group there before starting work on it.

## Non-negotiable constraints (do not relitigate these in code)

1. The admin and each site are two separate codebases with two separate deploy cycles. The only connection is a site's versioned `/v1/` HTTP API - never import from or vendor the agent's own source into this repo.
2. A registered site's raw API token must never reach the browser. The backend (`packages/server`) holds every site token server-side and injects it when calling that site's API; the browser only ever authenticates against this admin's own session.
3. All persisted admin state (site registry entries, user accounts) goes through the `Store` interface in `packages/server/src/store/`. No route handler reads or writes the JSON store files directly.
4. The data directory (`data/`, overridable via `ADMIN_DATA_DIR`) is authoritative, not derived or disposable, and lives outside any `dist/` output. A build must never be able to destroy it.

## Working rules

- Propose a plan and get confirmation before implementing anything that spans more than one package (`packages/server`/`packages/web`) or more than one module within a package.
- Small, reviewable increments. Commit at each green checkpoint with a clear message. Never batch a day of work into one commit.
- Never use `--force` with git, never rewrite history, never commit directly to main if a branch workflow is in place.
- TypeScript strict mode stays on. Do not weaken tsconfig to make errors go away.
- Dependencies: justify any new one in the commit message. This is a hosted control-plane app, not a package distributed to third parties, so the bar is "justify it," not the agent repo's "avoid at all costs" - but still prefer built-ins and first-party plugins (e.g. `@fastify/*`) over reinventing something non-trivial.
- Australian English in all comments, docs, and user-facing strings. No em dashes or en dashes anywhere.

## Definition of done for any task

A task is not done until:
1. `npm run typecheck` passes (fans out across both workspace packages)
2. `npm run lint` passes
3. `npm test` passes, including tests for the new behaviour (`node:test` for `packages/server`, Vitest for `packages/web`)
4. The relevant items in `../app-granite-cms/docs/phase-3-checklist.md` are ticked with a pointer to the test that proves each one

The Stop hook enforces 1 to 3 automatically. Do not attempt to work around it; if the gate is failing, the work is not finished.

## When unsure

If the build plan or phase checklist is ambiguous or silent on something structural, stop and ask rather than inventing. Flag it as a question, propose two options with trade-offs, and wait.
