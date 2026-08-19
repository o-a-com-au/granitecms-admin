import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Redis } from 'ioredis';
import { openRedisSessionStore } from '../../src/store/redis-session-store.ts';
import { loadConfig } from '../../src/config.ts';
import type { Session } from 'fastify';

// Real integration test against the local docker-compose Redis
// (docker compose up -d before running these) - same "empirical over
// mocked" bias as test/store/postgres-store.test.ts.
function makeSession(overrides: Partial<Session> = {}): Session {
  return { cookie: { originalMaxAge: null }, userId: 'jane', ...overrides } as Session;
}

describe('redis-session-store', () => {
  let raw: Redis;

  before(() => {
    raw = new Redis(loadConfig().redisUrl);
  });

  after(async () => {
    raw.disconnect();
  });

  afterEach(async () => {
    const keys = await raw.keys('session:*');
    if (keys.length > 0) {
      await raw.del(...keys);
    }
  });

  it('a session round-trips through save, find, list, and delete', async () => {
    const store = openRedisSessionStore(raw);

    assert.deepEqual(await store.list(), []);

    await store.save({ id: 'sess-1', session: makeSession() });
    assert.deepEqual(await store.find('sess-1'), { id: 'sess-1', session: makeSession() });
    assert.deepEqual(await store.list(), [{ id: 'sess-1', session: makeSession() }]);

    await store.delete('sess-1');
    assert.equal(await store.find('sess-1'), undefined);
    assert.deepEqual(await store.list(), []);
  });

  it('list() returns every saved session, not just one', async () => {
    const store = openRedisSessionStore(raw);

    await store.save({ id: 'sess-1', session: makeSession({ userId: 'jane' }) });
    await store.save({ id: 'sess-2', session: makeSession({ userId: 'bob' }) });

    const all = await store.list();
    assert.equal(all.length, 2);
    assert.deepEqual(
      new Set(all.map((record) => record.id)),
      new Set(['sess-1', 'sess-2']),
    );
  });

  it('save sets a real TTL on the underlying key, not an unbounded one', async () => {
    const store = openRedisSessionStore(raw);
    await store.save({ id: 'sess-1', session: makeSession() });

    const ttl = await raw.ttl('session:sess-1');
    // Genuinely set (not -1, "no expiry") and in the right ballpark
    // (30 days) - not asserting an exact second count, which would be
    // flaky.
    assert.ok(ttl > 0, `expected a positive TTL, got ${ttl}`);
    assert.ok(ttl <= 30 * 24 * 60 * 60, `expected at most 30 days, got ${ttl}`);
  });
});
