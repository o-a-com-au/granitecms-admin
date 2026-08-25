import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type SqliteDb = DatabaseSync;

// One shared connection for the whole process, same role as
// store/postgres/client.ts's openDb - callers (index.ts, tests) own the
// connection lifecycle, this just opens it. Creates the containing
// directory (ADMIN_DATA_DIR, see config.ts) if it doesn't exist yet -
// a fresh clone has no data/ folder at all.
export function openSqliteDb(path: string): SqliteDb {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  return new DatabaseSync(path);
}
