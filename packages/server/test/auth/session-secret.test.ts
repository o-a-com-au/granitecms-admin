import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSessionSecret } from '../../src/auth/session-secret.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import type { SessionSecretRecord } from '../../src/auth/session-secret.ts';

describe('session-secret', () => {
  const originalEnv = process.env.ADMIN_SESSION_SECRET;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ADMIN_SESSION_SECRET;
    } else {
      process.env.ADMIN_SESSION_SECRET = originalEnv;
    }
  });

  beforeEach(() => {
    delete process.env.ADMIN_SESSION_SECRET;
  });

  it('ADMIN_SESSION_SECRET always wins when set', async () => {
    process.env.ADMIN_SESSION_SECRET = 'a-fixed-secret-from-the-environment';
    const store = openInMemoryStore<SessionSecretRecord>();

    const secret = await ensureSessionSecret(store);
    assert.equal(secret, 'a-fixed-secret-from-the-environment');
    assert.equal(await store.find('singleton'), undefined);
  });

  it('generates and persists a secret on first call, then returns the same one', async () => {
    const store = openInMemoryStore<SessionSecretRecord>();

    const first = await ensureSessionSecret(store);
    const second = await ensureSessionSecret(store);

    assert.equal(first, second);
    assert.equal((await store.find('singleton'))?.secret, first);
  });
});
