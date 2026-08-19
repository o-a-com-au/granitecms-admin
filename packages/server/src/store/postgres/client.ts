import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.ts';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

// One shared connection pool for the whole process - every
// openPostgres*Store() call in index.ts passes this same instance in,
// rather than each opening its own connection the way
// openJsonFileStore() used to open its own file handle per store.
export function openDb(databaseUrl: string): Db {
  const sql = postgres(databaseUrl);
  return drizzle(sql, { schema });
}
