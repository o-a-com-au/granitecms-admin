# cms-agent admin

The control-plane application for `@oa/cms-agent` sites: site registry, sidebar editor, live preview, publish/discard controls, page history, and section/block editing.

This is a separate codebase from the agent (`app-granite-cms`), with its own deploy cycle. The only connection between the two is the agent's versioned `/v1/` HTTP API. See that repo's `docs/cms-build-plan.md` (Codebases and repositories, and the site agent API contract) and `docs/phase-3-checklist.md` for the plan this repo is being built against.

Nothing has been scaffolded here yet - this repo exists so Phase 3 work has a home from the start, per the build plan's constraint that the admin and the site are always two separate codebases.
