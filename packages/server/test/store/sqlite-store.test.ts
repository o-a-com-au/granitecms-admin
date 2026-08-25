import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openSqliteDb } from '../../src/store/sqlite/client.ts';
import { openSqliteUserStore } from '../../src/store/sqlite/user-store.ts';
import { openSqliteSiteStore } from '../../src/store/sqlite/site-store.ts';
import { openSqliteSiteAccessStore } from '../../src/store/sqlite/site-access-store.ts';
import { openSqliteSiteInviteStore } from '../../src/store/sqlite/site-invite-store.ts';
import { openSqliteSessionSecretStore } from '../../src/store/sqlite/session-secret-store.ts';
import { openSqliteSiteTokenEncryptionKeyStore } from '../../src/store/sqlite/site-token-encryption-key-store.ts';
import { openSqliteSessionStore } from '../../src/store/sqlite/session-store.ts';
import type { AdminUser } from '../../src/auth/users.ts';
import type { Site } from '../../src/sites/site.ts';
import type { SiteAccess } from '../../src/sites/site-access.ts';
import type { SiteInvite } from '../../src/sites/site-invite.ts';

// Same "real, not mocked" bias as test/store/postgres-store.test.ts, but
// against an in-memory node:sqlite database instead of a real Postgres
// connection - a fresh :memory: database per test, no shared state or
// truncation step needed the way the Postgres suite requires.
const TEST_ENCRYPTION_KEY = randomBytes(32);

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'jane',
    username: 'jane',
    passwordHash: 'hash',
    passwordSalt: 'salt',
    firstName: 'Jane',
    lastName: 'Editor',
    email: 'jane@example.com',
    role: 'developer',
    status: 'active',
    timezone: 'UTC',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'site-1',
    url: 'https://example.com',
    token: 'a-token',
    ownerId: 'jane',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('sqlite stores', () => {
  it('users: round-trips through save/find/list/delete, and findByEmail is case-insensitive', async () => {
    const store = openSqliteUserStore(openSqliteDb(':memory:'));

    assert.deepEqual(await store.list(), []);
    await store.save(makeUser());
    assert.deepEqual(await store.find('jane'), makeUser());
    assert.equal((await store.list()).length, 1);

    assert.deepEqual(await store.findByEmail('JANE@Example.com'), makeUser());
    assert.equal(await store.findByEmail('nobody@example.com'), undefined);

    await store.save(makeUser({ firstName: 'Janet' }));
    assert.equal((await store.find('jane'))?.firstName, 'Janet');

    await store.delete('jane');
    assert.equal(await store.find('jane'), undefined);
  });

  it('sites: listByOwner returns only that owner\'s sites', async () => {
    const db = openSqliteDb(':memory:');
    const store = openSqliteSiteStore(db, TEST_ENCRYPTION_KEY);

    await store.save(makeSite({ id: 'site-1', ownerId: 'jane' }));
    await store.save(makeSite({ id: 'site-2', ownerId: 'jane', url: 'https://second.example.com' }));
    await store.save(makeSite({ id: 'site-3', ownerId: 'other-dev', url: 'https://other.example.com' }));

    const janesSites = await store.listByOwner('jane');
    assert.equal(janesSites.length, 2);
    assert.deepEqual(new Set(janesSites.map((s) => s.id)), new Set(['site-1', 'site-2']));
  });

  it('site access: listBySite and listByUser each return the right slice', async () => {
    const db = openSqliteDb(':memory:');
    const store = openSqliteSiteAccessStore(db);

    const grant: SiteAccess = { id: 'jane:site-1', userId: 'jane', siteId: 'site-1', grantedAt: '2026-01-01T00:00:00.000Z' };
    await store.save(grant);

    assert.deepEqual(await store.listBySite('site-1'), [grant]);
    assert.deepEqual(await store.listByUser('jane'), [grant]);
    assert.deepEqual(await store.listBySite('site-2'), []);
    assert.deepEqual(await store.listByUser('someone-else'), []);
  });

  it('site invites: listBySite returns only that site\'s invites, including nullable claim fields', async () => {
    const db = openSqliteDb(':memory:');
    const store = openSqliteSiteInviteStore(db);

    const invite: SiteInvite = {
      id: 'invite-hash-1',
      siteId: 'site-1',
      email: 'client@example.com',
      createdBy: 'jane',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-08T00:00:00.000Z',
      claimedAt: null,
      claimedByUserId: null,
    };
    await store.save(invite);

    assert.deepEqual(await store.listBySite('site-1'), [invite]);
    assert.deepEqual(await store.listBySite('site-2'), []);

    await store.save({ ...invite, claimedAt: '2026-01-02T00:00:00.000Z', claimedByUserId: 'client-1' });
    const [claimed] = await store.listBySite('site-1');
    assert.equal(claimed?.claimedAt, '2026-01-02T00:00:00.000Z');
    assert.equal(claimed?.claimedByUserId, 'client-1');
  });

  it('sites: the token is genuinely encrypted at rest', () => {
    const db = openSqliteDb(':memory:');
    const store = openSqliteSiteStore(db, TEST_ENCRYPTION_KEY);

    return store.save(makeSite({ id: 'site-1', token: 'a-real-site-token' })).then(async () => {
      // Bypass the store entirely - the raw column value must not be
      // the plaintext token, and must carry the v1: prefix
      // (sites/site-token-crypto.ts) that marks it as encrypted.
      const raw = db.prepare('SELECT data FROM sites WHERE id = ?').get('site-1') as { data: string };
      const rawToken = (JSON.parse(raw.data) as Site).token;
      assert.notEqual(rawToken, 'a-real-site-token');
      assert.match(rawToken, /^v1:/);

      // The store itself still returns it decrypted, transparently.
      assert.equal((await store.find('site-1'))?.token, 'a-real-site-token');
    });
  });

  it('session secret: a single singleton row round-trips', async () => {
    const store = openSqliteSessionSecretStore(openSqliteDb(':memory:'));

    assert.equal(await store.find('singleton'), undefined);
    await store.save({ id: 'singleton', secret: 'a-real-secret' });
    assert.deepEqual(await store.find('singleton'), { id: 'singleton', secret: 'a-real-secret' });
  });

  it('site token encryption key: a single singleton row round-trips', async () => {
    const store = openSqliteSiteTokenEncryptionKeyStore(openSqliteDb(':memory:'));

    assert.equal(await store.find('singleton'), undefined);
    await store.save({ id: 'singleton', key: 'a-real-key' });
    assert.deepEqual(await store.find('singleton'), { id: 'singleton', key: 'a-real-key' });
  });

  it('sessions: round-trips through save, find, list, and delete', async () => {
    const store = openSqliteSessionStore(openSqliteDb(':memory:'));

    assert.deepEqual(await store.list(), []);

    await store.save({ id: 'sess-1', session: { cookie: { originalMaxAge: null } } as never });
    assert.equal((await store.find('sess-1'))?.id, 'sess-1');
    assert.equal((await store.list()).length, 1);

    await store.delete('sess-1');
    assert.equal(await store.find('sess-1'), undefined);
  });

  it('ensureTable is idempotent - opening the same store twice against the same db does not throw', () => {
    const db = openSqliteDb(':memory:');
    assert.doesNotThrow(() => {
      openSqliteUserStore(db);
      openSqliteUserStore(db);
    });
  });
});
