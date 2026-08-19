import type { Redis } from 'ioredis';
import type { Store } from './store.ts';
import type { SessionRecord } from '../auth/session-store-adapter.ts';

const KEY_PREFIX = 'session:';

// 30 days - the JSON-file store never expired a session record at
// all (routes/auth.ts's cookie config sets no maxAge either), so this
// is a new safety-net expiry, not a behaviour port. A session no
// browser has refreshed in 30 days expiring cleanly via Redis's own
// TTL, rather than sitting forever, is a deliberate improvement one
// of the reasons for moving sessions off the JSON-file store in the
// first place - not something anyone will notice logging in normally.
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function keyFor(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

// Backs the same Store<SessionRecord> interface the JSON-file store
// did - @fastify/session's own registration still goes through the
// existing toSessionStore() adapter (auth/session-store-adapter.ts)
// unchanged, and routes/auth.ts's "log out every other session on a
// password change" still calls list()/delete() directly, the same as
// before. Only the storage engine underneath changes.
//
// Takes an already-open Redis client, not a URL - mirrors
// store/postgres/*-store.ts each taking a shared Db rather than
// opening their own connection, so callers (index.ts, and tests) own
// the connection lifecycle instead of it being hidden inside here.
export function openRedisSessionStore(redis: Redis): Store<SessionRecord> {
  return {
    async list() {
      const keys: string[] = [];
      let cursor = '0';
      do {
        // SCAN, not KEYS - KEYS blocks the whole Redis instance while
        // it runs, unacceptable once this holds more than a handful
        // of sessions; SCAN cursors through incrementally instead.
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 100);
        keys.push(...batch);
        cursor = nextCursor;
      } while (cursor !== '0');

      if (keys.length === 0) {
        return [];
      }
      const values = await redis.mget(...keys);
      return values
        .map((value: string | null) => (value ? (JSON.parse(value) as SessionRecord) : null))
        .filter((record: SessionRecord | null): record is SessionRecord => record !== null);
    },
    async find(id) {
      const value = await redis.get(keyFor(id));
      return value ? (JSON.parse(value) as SessionRecord) : undefined;
    },
    async save(record) {
      await redis.set(keyFor(record.id), JSON.stringify(record), 'EX', SESSION_TTL_SECONDS);
    },
    async delete(id) {
      await redis.del(keyFor(id));
    },
  };
}
