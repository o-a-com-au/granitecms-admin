# Portable on purpose - this is a plain Dockerfile, not a Railway-
# specific Nixpacks build, so it runs identically on Railway, Render,
# Fly, ECS, or a bare VPS with nothing more than `docker build`. See
# docker-compose.yml for the local-dev Postgres/Redis this expects at
# runtime (DATABASE_URL/REDIS_URL - not provided by this image itself).

# --- Stage 1: build the web frontend --------------------------------
# The server serves packages/web/dist as static assets
# (@fastify/static, see packages/server/src/server.ts) - this stage
# only exists to produce that directory; nothing else from it ships.
FROM node:22-alpine AS web-build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci
COPY packages/web packages/web
RUN npm run build --workspace packages/web

# --- Stage 2: runtime -------------------------------------------------
# Runs the server from source (node --experimental-strip-types), the
# same way every dev/test/live-verification invocation already does in
# this repo - not the tsc-compiled dist/ output, which nothing in this
# project actually exercises today. Also keeps db:migrate working
# unchanged (packages/server/src/store/postgres/migrate.ts loads its
# SQL files and sibling source modules directly, not from a build
# artifact).
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci --omit=dev
COPY packages/server/src packages/server/src
COPY packages/server/drizzle.config.ts packages/server/drizzle.config.ts
COPY --from=web-build /app/packages/web/dist packages/web/dist

EXPOSE 4278
CMD ["node", "--experimental-strip-types", "packages/server/src/index.ts"]
