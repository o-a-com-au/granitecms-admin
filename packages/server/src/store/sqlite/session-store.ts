import type { SessionRecord } from '../../auth/session-store-adapter.ts';
import type { Store } from '../store.ts';
import type { SqliteDb } from './client.ts';
import { openSqliteStore } from './generic-store.ts';

// Backs the same Store<SessionRecord> interface openRedisSessionStore
// does (store/redis-session-store.ts) - @fastify/session's registration
// still goes through the existing toSessionStore() adapter unchanged.
// No TTL enforcement, same as the old JSON-file store this project once
// had: acceptable for a single local developer, not a real hosted
// deployment (which uses Redis, with its own TTL, instead).
export function openSqliteSessionStore(db: SqliteDb): Store<SessionRecord> {
  return openSqliteStore<SessionRecord>(db, 'sessions');
}
