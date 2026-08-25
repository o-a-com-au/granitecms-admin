#!/usr/bin/env bash
# One-shot local dev bootstrap: brings up Postgres/Redis, waits for
# Postgres to actually accept connections (docker compose up -d
# returns long before the database inside is ready to take queries),
# runs the schema migrations that are otherwise a separate manual step
# (see docs/deployment.md - migrations are deliberately never run
# automatically at boot), then starts the normal dev servers.
#
# ADMIN_BOOTSTRAP_USERNAME/PASSWORD are set here, not left to the
# generate-and-print-once fallback in auth/bootstrap.ts - that fallback
# is fine for a real deploy, but for local dev it means a missed log
# line has no recovery path short of editing Postgres by hand. A fixed,
# well-known local login removes that failure mode entirely. Never use
# these values for anything but local development.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Starting Postgres and Redis..."
docker compose up -d

echo "Waiting for Postgres to accept connections..."
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U admin >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker compose exec -T postgres pg_isready -U admin >/dev/null 2>&1; then
  echo "Postgres did not become ready in time." >&2
  exit 1
fi

echo "Running migrations..."
(cd packages/server && npm run db:migrate)

echo "Starting the admin (local dev login: admin / admin)..."
export ADMIN_BOOTSTRAP_USERNAME="${ADMIN_BOOTSTRAP_USERNAME:-admin}"
export ADMIN_BOOTSTRAP_PASSWORD="${ADMIN_BOOTSTRAP_PASSWORD:-admin}"
exec npm run dev
