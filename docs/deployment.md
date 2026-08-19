# Deploying the admin

This is a plain Docker image (`Dockerfile` at the repo root) - it runs
identically on Railway, Render, Fly, ECS, or a bare VPS with nothing
more than `docker build`/`docker run`. `railway.json` is Railway-
specific config (health check, restart policy) layered on top of that
same portable image, not a replacement for it.

The image runs the server directly from TypeScript source
(`node --experimental-strip-types packages/server/src/index.ts`), the
same way every local dev/test invocation in this repo already does -
not the `tsc`-compiled `dist/` output, which nothing in this project
actually exercises today.

## Required environment variables

- `DATABASE_URL` - Postgres connection string.
- `REDIS_URL` - Redis connection string.
- `ADMIN_BASE_URL` - the externally-reachable origin (e.g.
  `https://admin.example.com`). Used to build OAuth callback URLs and
  invite claim links - get this wrong and both break.
- `TRUST_PROXY` - set to `true` if the platform's own edge/load
  balancer is the only way to reach this process (true on Railway,
  Render, Fly, etc. by default), otherwise the specific proxy
  IP/CIDR. Needed for the session cookie's `secure: 'auto'` to see the
  real client protocol - see `packages/server/src/config.ts`.

## Strongly recommended (has a safe default, but set it explicitly)

- `ADMIN_SESSION_SECRET` - if unset, one is generated and persisted in
  Postgres on first boot (`auth/session-secret.ts`). Works, but an
  explicit value from a real secrets manager is better practice.
- `SITE_TOKEN_ENCRYPTION_KEY` - same story
  (`sites/site-token-encryption-key.ts`), `openssl rand -base64 32` to
  generate one. **Losing this key makes every already-encrypted site
  token undecryptable** - unlike the session secret, this one is
  worth actually backing up somewhere, not just letting it live only
  in Postgres.
- `ADMIN_BOOTSTRAP_USERNAME` / `ADMIN_BOOTSTRAP_PASSWORD` - the first
  admin account. If unset, one is generated and printed once to
  stdout on first boot (`auth/bootstrap.ts`) - fine locally, easy to
  miss in a real deploy's log stream. Set both explicitly instead.

## Optional (unconfigured is a fully supported state)

- `SENTRY_DSN` - error tracking. Unconfigured means `Sentry.captureException`
  safely no-ops.
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM`
  - invite emails. Unconfigured falls back to showing the raw invite
  link in the UI instead of emailing it.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID` /
  `GITHUB_CLIENT_SECRET` - OAuth sign-in. Unconfigured just omits that
  provider's button.
- `LOG_LEVEL` - defaults to `info`.
- `PORT` - defaults to `4278`. Most platforms (Railway included)
  inject this automatically; the app already binds `0.0.0.0`, not
  `localhost`, so it's reachable either way.

## Running migrations

Migrations are a deliberate, manual step - never run automatically at
boot (same philosophy the sibling agent repo holds for content
migrations). After the first deploy (and after any deploy that adds a
new migration file under
`packages/server/src/store/postgres/migrations/`), run:

```
railway run --service <service-name> sh -c \
  'cd packages/server && node --experimental-strip-types src/store/postgres/migrate.ts'
```

(or the equivalent one-off command on whatever platform is in use -
the working directory matters: `migrate.ts` resolves its migrations
folder relative to `packages/server/`, not the repo root.)

## Local verification before every real deploy

```
docker build -t cms-admin .
docker compose up -d   # local Postgres/Redis
docker run --rm -p 4278:4278 \
  --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL=postgres://admin:admin@host.docker.internal:5432/cms_admin \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  cms-admin
```

Confirmed working this way: image builds, boots, bootstraps a fresh
admin, logs in, serves the real built frontend, runs migrations from
inside a running container, and drains cleanly on `docker stop`
(`SIGTERM`) with an exit code of 0.
