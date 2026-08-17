import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { backfillSiteOwnership } from '../../src/sites/site-ownership-backfill.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import type { AdminUser } from '../../src/auth/users.ts';
import type { Site } from '../../src/sites/site.ts';

function makeUser(id: string, role: AdminUser['role'], createdAt: string): AdminUser {
  return {
    id,
    username: id,
    passwordHash: 'unused',
    passwordSalt: 'unused',
    name: id,
    email: `${id}@example.com`,
    role,
    status: 'active',
    timezone: 'UTC',
    createdAt,
  };
}

function makeSite(id: string, ownerId: string): Site {
  return {
    id,
    url: 'http://127.0.0.1:1',
    token: 'unused',
    ownerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('backfillSiteOwnership', () => {
  it('assigns every ownerless site to the earliest-created developer when several developers exist', async () => {
    const usersStore = openInMemoryStore<AdminUser>();
    await usersStore.save(makeUser('later-dev', 'developer', '2026-02-01T00:00:00.000Z'));
    await usersStore.save(makeUser('earliest-dev', 'developer', '2026-01-01T00:00:00.000Z'));
    await usersStore.save(makeUser('middle-dev', 'developer', '2026-01-15T00:00:00.000Z'));

    const sitesStore = openInMemoryStore<Site>();
    const siteAId = randomUUID();
    const siteBId = randomUUID();
    // Cast past ownerId's required-ness on purpose - this simulates
    // pre-migration data on disk that predates the field existing.
    await sitesStore.save({ ...makeSite(siteAId, ''), ownerId: undefined as unknown as string });
    await sitesStore.save({ ...makeSite(siteBId, ''), ownerId: undefined as unknown as string });

    await backfillSiteOwnership(usersStore, sitesStore);

    const siteA = await sitesStore.find(siteAId);
    const siteB = await sitesStore.find(siteBId);
    assert.equal(siteA!.ownerId, 'earliest-dev');
    assert.equal(siteB!.ownerId, 'earliest-dev');
  });

  it('ignores client accounts when choosing the earliest developer, even if a client was created first', async () => {
    const usersStore = openInMemoryStore<AdminUser>();
    await usersStore.save(makeUser('earliest-client', 'client', '2025-01-01T00:00:00.000Z'));
    await usersStore.save(makeUser('only-dev', 'developer', '2026-01-01T00:00:00.000Z'));

    const sitesStore = openInMemoryStore<Site>();
    const siteId = randomUUID();
    await sitesStore.save({ ...makeSite(siteId, ''), ownerId: undefined as unknown as string });

    await backfillSiteOwnership(usersStore, sitesStore);

    assert.equal((await sitesStore.find(siteId))!.ownerId, 'only-dev');
  });

  it('is a no-op when every site is already owned, even with no developer account at all', async () => {
    const usersStore = openInMemoryStore<AdminUser>();
    const sitesStore = openInMemoryStore<Site>();
    const siteId = randomUUID();
    await sitesStore.save(makeSite(siteId, 'already-owned-by'));

    await backfillSiteOwnership(usersStore, sitesStore);

    assert.equal((await sitesStore.find(siteId))!.ownerId, 'already-owned-by');
  });

  it('only backfills the ownerless sites, leaving already-owned sites untouched', async () => {
    const usersStore = openInMemoryStore<AdminUser>();
    await usersStore.save(makeUser('the-dev', 'developer', '2026-01-01T00:00:00.000Z'));

    const sitesStore = openInMemoryStore<Site>();
    const ownedSiteId = randomUUID();
    const ownerlessSiteId = randomUUID();
    await sitesStore.save(makeSite(ownedSiteId, 'someone-else'));
    await sitesStore.save({ ...makeSite(ownerlessSiteId, ''), ownerId: undefined as unknown as string });

    await backfillSiteOwnership(usersStore, sitesStore);

    assert.equal((await sitesStore.find(ownedSiteId))!.ownerId, 'someone-else');
    assert.equal((await sitesStore.find(ownerlessSiteId))!.ownerId, 'the-dev');
  });

  it('throws rather than writing an invalid record when an ownerless site exists but no developer account does', async () => {
    const usersStore = openInMemoryStore<AdminUser>();
    const sitesStore = openInMemoryStore<Site>();
    const siteId = randomUUID();
    await sitesStore.save({ ...makeSite(siteId, ''), ownerId: undefined as unknown as string });

    await assert.rejects(() => backfillSiteOwnership(usersStore, sitesStore), /no developer account exists/);

    assert.equal((await sitesStore.find(siteId))!.ownerId, undefined, 'must not have written a partial/invalid record');
  });
});
