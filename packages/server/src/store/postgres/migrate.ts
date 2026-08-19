import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { openDb } from './client.ts';
import { loadConfig } from '../../config.ts';

// Run directly (`npm run db:migrate` from packages/server), not
// imported by the app at boot - applying migrations is a deliberate
// operator action, same spirit as this repo never auto-running
// content migrations either.
const config = loadConfig();
const db = openDb(config.databaseUrl);
await migrate(db, { migrationsFolder: './src/store/postgres/migrations' });
console.log('Migrations applied.');
process.exit(0);
