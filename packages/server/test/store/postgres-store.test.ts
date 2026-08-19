import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { openDb, type Db } from '../../src/store/postgres/client.ts';
import { loadConfig } from '../../src/config.ts';
import { openPostgresUserStore } from '../../src/store/postgres/user-store.ts';
import { openPostgresSiteStore } from '../../src/store/postgres/site-store.ts';
import { openPostgresSiteAccessStore } from '../../src/store/postgres/site-access-store.ts';
import { openPostgresSiteInviteStore } from '../../src/store/postgres/site-invite-store.ts';
import { openPostgresSessionSecretStore } from '../../src/store/postgres/session-secret-store.ts';
import type { AdminUser } from '../../src/auth/users.ts';
import type { Site } from '../../src/sites/site.ts';
import type { SiteAccess } from '../../src/sites/site-access.ts';
import type { SiteInvite } from '../../src/sites/site-invite.ts';

// Real integration tests against the local docker-compose Postgres
// (docker compose up -d, then npm run db:migrate, before running
// these) - not mocked, same "empirical over mocked" bias the rest of
// this project already follows for real HTTP servers in the sites/
// tests. Every table is truncated between tests for isolation.
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

async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE users, sites, site_access, site_invites, session_secret`);
}

describe('postgres stores', () => {
  let db: Db;

  before(async () => {
    db = openDb(loadConfig().databaseUrl);
    // Not just afterEach - a locally-running dev server (npm run dev,
    // pointed at this same database) may already have bootstrapped a
    // real admin account before this suite ever runs. This suite
    // assumes exclusive ownership of its tables, same as
    // json-file-store.test.ts assumes a fresh temp directory.
    await truncateAll(db);
  });

  after(async () => {
    await db.$client.end();
  });

  afterEach(async () => {
    await truncateAll(db);
  });

  it('users: round-trips through save/find/list/delete, and findByEmail is case-insensitive', async () => {
    const store = openPostgresUserStore(db);

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
    const store = openPostgresSiteStore(db);
    const userStore = openPostgresUserStore(db);
    await userStore.save(makeUser());
    await userStore.save(makeUser({ id: 'other-dev', username: 'other-dev', email: 'other@example.com' }));

    await store.save(makeSite({ id: 'site-1', ownerId: 'jane' }));
    await store.save(makeSite({ id: 'site-2', ownerId: 'jane', url: 'https://second.example.com' }));
    await store.save(makeSite({ id: 'site-3', ownerId: 'other-dev', url: 'https://other.example.com' }));

    const janesSites = await store.listByOwner('jane');
    assert.equal(janesSites.length, 2);
    assert.deepEqual(new Set(janesSites.map((s) => s.id)), new Set(['site-1', 'site-2']));
  });

  it('site access: listBySite and listByUser each return the right slice', async () => {
    const userStore = openPostgresUserStore(db);
    const siteStore = openPostgresSiteStore(db);
    const store = openPostgresSiteAccessStore(db);
    await userStore.save(makeUser());
    await siteStore.save(makeSite());

    const grant: SiteAccess = { id: 'jane:site-1', userId: 'jane', siteId: 'site-1', grantedAt: '2026-01-01T00:00:00.000Z' };
    await store.save(grant);

    assert.deepEqual(await store.listBySite('site-1'), [grant]);
    assert.deepEqual(await store.listByUser('jane'), [grant]);
    assert.deepEqual(await store.listBySite('site-2'), []);
    assert.deepEqual(await store.listByUser('someone-else'), []);
  });

  it('site invites: listBySite returns only that site\'s invites, including nullable claim fields', async () => {
    const userStore = openPostgresUserStore(db);
    const siteStore = openPostgresSiteStore(db);
    const store = openPostgresSiteInviteStore(db);
    await userStore.save(makeUser());
    await siteStore.save(makeSite());

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

  it('session secret: a single singleton row round-trips', async () => {
    const store = openPostgresSessionSecretStore(db);

    assert.equal(await store.find('singleton'), undefined);
    await store.save({ id: 'singleton', secret: 'a-real-secret' });
    assert.deepEqual(await store.find('singleton'), { id: 'singleton', secret: 'a-real-secret' });
  });
});
