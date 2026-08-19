import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openInMemoryUserStore } from '../../src/store/user-store.ts';
import { openInMemorySiteStore } from '../../src/store/site-store.ts';
import { openInMemorySiteAccessStore } from '../../src/store/site-access-store.ts';
import { openInMemorySiteInviteStore } from '../../src/store/site-invite-store.ts';

// The base list/find/save/delete round-trip is already covered by
// in-memory-store.test.ts - this covers only the extra indexed
// methods each of these adds on top.
describe('in-memory store extensions', () => {
  it('UserStore.findByEmail is case-insensitive, matching normaliseUsername', async () => {
    const store = openInMemoryUserStore();
    await store.save({
      id: 'jane',
      username: 'jane',
      passwordHash: 'hash',
      passwordSalt: 'salt',
      firstName: 'Jane',
      lastName: 'Editor',
      email: 'Jane@Example.com',
      role: 'developer',
      status: 'active',
      timezone: 'UTC',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    assert.equal((await store.findByEmail('jane@example.com'))?.id, 'jane');
    assert.equal(await store.findByEmail('nobody@example.com'), undefined);
  });

  it('SiteStore.listByOwner returns only that owner\'s sites', async () => {
    const store = openInMemorySiteStore();
    await store.save({ id: 'site-1', url: 'https://a.example.com', token: 't', ownerId: 'jane', createdAt: 'x', updatedAt: 'x' });
    await store.save({ id: 'site-2', url: 'https://b.example.com', token: 't', ownerId: 'other', createdAt: 'x', updatedAt: 'x' });

    const janesSites = await store.listByOwner('jane');
    assert.equal(janesSites.length, 1);
    assert.equal(janesSites[0]?.id, 'site-1');
  });

  it('SiteAccessStore.listBySite/listByUser each return the right slice', async () => {
    const store = openInMemorySiteAccessStore();
    await store.save({ id: 'jane:site-1', userId: 'jane', siteId: 'site-1', grantedAt: 'x' });
    await store.save({ id: 'jane:site-2', userId: 'jane', siteId: 'site-2', grantedAt: 'x' });
    await store.save({ id: 'bob:site-1', userId: 'bob', siteId: 'site-1', grantedAt: 'x' });

    assert.equal((await store.listBySite('site-1')).length, 2);
    assert.equal((await store.listByUser('jane')).length, 2);
    assert.equal((await store.listBySite('site-3')).length, 0);
  });

  it('SiteInviteStore.listBySite returns only that site\'s invites', async () => {
    const store = openInMemorySiteInviteStore();
    await store.save({
      id: 'invite-1',
      siteId: 'site-1',
      email: 'a@example.com',
      createdBy: 'jane',
      createdAt: 'x',
      expiresAt: 'x',
      claimedAt: null,
      claimedByUserId: null,
    });
    await store.save({
      id: 'invite-2',
      siteId: 'site-2',
      email: 'b@example.com',
      createdBy: 'jane',
      createdAt: 'x',
      expiresAt: 'x',
      claimedAt: null,
      claimedByUserId: null,
    });

    const invites = await store.listBySite('site-1');
    assert.equal(invites.length, 1);
    assert.equal(invites[0]?.id, 'invite-1');
  });
});
