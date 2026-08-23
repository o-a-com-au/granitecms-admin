-- Runs once, automatically, only on a fresh volume (the official
-- postgres image only executes /docker-entrypoint-initdb.d/* the very
-- first time a container starts against an empty data directory) - a
-- separate database for packages/server's own integration tests, so
-- `npm test` never touches the same database `npm run dev` bootstraps
-- a real local admin account into. Needs its own migration run once
-- created: DATABASE_URL=postgres://admin:admin@localhost:5432/cms_admin_test npm run db:migrate --workspace packages/server
CREATE DATABASE cms_admin_test;
