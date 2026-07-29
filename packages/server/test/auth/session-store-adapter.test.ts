import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from 'fastify';
import { toSessionStore } from '../../src/auth/session-store-adapter.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';
import { openInMemoryStore } from '../support/in-memory-store.ts';

function fakeSession(): Session {
  return { cookie: { originalMaxAge: null } } as Session;
}

function set(store: ReturnType<typeof toSessionStore>, id: string, session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    store.set(id, session, (error) => (error ? reject(error) : resolve()));
  });
}

function get(store: ReturnType<typeof toSessionStore>, id: string): Promise<Session | null | undefined> {
  return new Promise((resolve, reject) => {
    store.get(id, (error, result) => (error ? reject(error) : resolve(result)));
  });
}

function destroy(store: ReturnType<typeof toSessionStore>, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    store.destroy(id, (error) => (error ? reject(error) : resolve()));
  });
}

describe('session-store-adapter', () => {
  it('set then get round-trips a session through the underlying Store', async () => {
    const store = toSessionStore(openInMemoryStore<SessionRecord>());
    const session = fakeSession();

    await set(store, 'session-1', session);
    const result = await get(store, 'session-1');

    assert.deepEqual(result, session);
  });

  it('get returns null for an unknown session id, not an error', async () => {
    const store = toSessionStore(openInMemoryStore<SessionRecord>());

    const result = await get(store, 'does-not-exist');
    assert.equal(result, null);
  });

  it('destroy removes the session so a later get returns null', async () => {
    const store = toSessionStore(openInMemoryStore<SessionRecord>());
    const session = fakeSession();

    await set(store, 'session-1', session);
    await destroy(store, 'session-1');
    const result = await get(store, 'session-1');

    assert.equal(result, null);
  });
});
