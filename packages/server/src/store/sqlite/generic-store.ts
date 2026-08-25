import type { Store } from '../store.ts';
import type { SqliteDb } from './client.ts';

// Idempotent - safe to call on every boot, unlike the Postgres path's
// deliberately manual migrations (docs/deployment.md). That rule exists
// to protect a shared, hosted database with other consumers from silent
// schema drift; a private, single-file local database with none of that
// risk doesn't need the same ceremony.
export function ensureTable(db: SqliteDb, table: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
}

// The whole record is stored as an opaque JSON blob, not one column per
// field - this data is small-volume and authoritative (store.ts's own
// words), the same reasoning that already justifies openInMemoryStore's
// "load list(), filter in JS" approach for every store's extra query
// methods. A real per-column relational schema (mirroring
// store/postgres/schema.ts) would buy nothing here that isn't already
// covered by that same in-JS filtering, for real persistence instead of
// an in-memory Map.
export function openSqliteStore<T extends { id: string }>(db: SqliteDb, table: string): Store<T> {
  ensureTable(db, table);
  const selectAll = db.prepare(`SELECT data FROM ${table}`);
  const selectOne = db.prepare(`SELECT data FROM ${table} WHERE id = ?`);
  const upsert = db.prepare(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`);
  const remove = db.prepare(`DELETE FROM ${table} WHERE id = ?`);

  return {
    async list() {
      return (selectAll.all() as { data: string }[]).map((row) => JSON.parse(row.data) as T);
    },
    async find(id) {
      const row = selectOne.get(id) as { data: string } | undefined;
      return row ? (JSON.parse(row.data) as T) : undefined;
    },
    async save(record) {
      upsert.run(record.id, JSON.stringify(record));
    },
    async delete(id) {
      remove.run(id);
    },
  };
}
