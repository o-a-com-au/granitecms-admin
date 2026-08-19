import { defineConfig } from 'drizzle-kit';

// drizzle-kit generate/migrate only - not imported by the app itself
// (see src/store/postgres/client.ts for the runtime connection).
// Matches docker-compose.yml's local Postgres by default, same
// convenience-default pattern as config.ts's own DATABASE_URL.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/store/postgres/schema.ts',
  out: './src/store/postgres/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://admin:admin@localhost:5432/cms_admin',
  },
});
