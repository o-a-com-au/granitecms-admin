import type { SessionSecretRecord } from '../../auth/session-secret.ts';
import type { Store } from '../store.ts';
import type { SqliteDb } from './client.ts';
import { openSqliteStore } from './generic-store.ts';

// No extension interface needed, same as store/postgres/session-secret-store.ts -
// ensureSessionSecret only ever does a single find('singleton')/save().
export function openSqliteSessionSecretStore(db: SqliteDb): Store<SessionSecretRecord> {
  return openSqliteStore<SessionSecretRecord>(db, 'session_secret');
}
