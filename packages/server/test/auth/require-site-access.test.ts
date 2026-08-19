import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildServer, type ServerDeps } from '../../src/server.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { openInMemoryUserStore } from '../../src/store/user-store.ts';
import { openInMemorySiteStore } from '../../src/store/site-store.ts';
import { openInMemorySiteAccessStore } from '../../src/store/site-access-store.ts';
import { openInMemorySiteInviteStore } from '../../src/store/site-invite-store.ts';
import { hashPassword } from '../../src/auth/password.ts';
import type { AdminUser } from '../../src/auth/users.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';
import { siteAccessId } from '../../src/sites/site-access.ts';

// requireSiteAccess is already exercised indirectly by
// test/routes/sites.test.ts's ~2100 lines (every registerSite() call
// goes through the real developer-owns-what-they-register path), but
// nothing there proves the *denial* side of the guard: another
// developer's site, an ungranted client, and the GET //POST /
// role-based scoping logic that isn't a preHandler at all. This file
// is that missing coverage, kept separate rather than added to the
// already-huge sites.test.ts.

const PASSWORD = 'correct horse battery staple';

interface Deps {
  usersStore: ReturnType<typeof openInMemoryUserStore>;
  sitesStore: ReturnType<typeof openInMemorySiteStore>;
  siteAccessStore: ReturnType<typeof openInMemorySiteAccessStore>;
}

async function buildTestServer(): Promise<{ app: Awaited<ReturnType<typeof buildServer>>; deps: Deps }> {
  const usersStore = openInMemoryUserStore();
  const sitesStore = openInMemorySiteStore();
  const siteAccessStore = openInMemorySiteAccessStore();

  const serverDeps: ServerDeps = {
    usersStore,
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore,
    siteAccessStore,
    siteInviteStore: openInMemorySiteInviteStore(),
    oauthProviders: [],
    baseUrl: '',
    mailer: undefined,
  };
  const app = await buildServer(undefined, serverDeps);

  return { app, deps: { usersStore, sitesStore, siteAccessStore } };
}

async function createUser(deps: Deps, id: string, role: AdminUser['role']): Promise<void> {
  const { hash, salt } = hashPassword(PASSWORD);
  await deps.usersStore.save({
    id,
    username: id,
    passwordHash: hash,
    passwordSalt: salt,
    firstName: id,
    lastName: '',
    email: `${id}@example.com`,
    role,
    status: 'active',
    timezone: 'UTC',
    createdAt: new Date().toISOString(),
  });
}

async function createSite(deps: Deps, ownerId: string): Promise<string> {
  const id = randomUUID();
  await deps.sitesStore.save({
    id,
    url: 'http://127.0.0.1:1',
    token: 'unused',
    ownerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return id;
}

async function loginCookie(app: Awaited<ReturnType<typeof buildServer>>, username: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: PASSWORD } });
  const header = response.headers['set-cookie'];
  const raw = Array.isArray(header) ? header[0] : header;
  assert.ok(raw, 'expected a session cookie from login');
  return raw.split(';')[0] as string;
}

describe('requireSiteAccess', () => {
  it('a developer can DELETE (a pure store operation, no network call) their own site', async () => {
    const { app, deps } = await buildTestServer();
    await createUser(deps, 'owner-dev', 'developer');
    const siteId = await createSite(deps, 'owner-dev');
    const cookie = await loginCookie(app, 'owner-dev');

    const response = await app.inject({ method: 'DELETE', url: `/api/sites/${siteId}`, headers: { cookie } });
    assert.equal(response.statusCode, 204);

    await app.close();
  });

  it('a developer gets 404, not 403, when deleting another developer\'s site - identical to a nonexistent site', async () => {
    const { app, deps } = await buildTestServer();
    await createUser(deps, 'owner-dev', 'developer');
    await createUser(deps, 'other-dev', 'developer');
    const siteId = await createSite(deps, 'owner-dev');
    const cookie = await loginCookie(app, 'other-dev');

    const wrongOwnerResponse = await app.inject({ method: 'DELETE', url: `/api/sites/${siteId}`, headers: { cookie } });
    const nonexistentResponse = await app.inject({ method: 'DELETE', url: `/api/sites/${randomUUID()}`, headers: { cookie } });

    assert.equal(wrongOwnerResponse.statusCode, 404);
    assert.equal(nonexistentResponse.statusCode, 404);
    assert.equal(wrongOwnerResponse.json().error, nonexistentResponse.json().error, 'wrong owner and nonexistent must be the same error shape');

    // Confirm the site genuinely survives an unauthorised delete
    // attempt, not just that the status code happened to be 404.
    assert.ok(await deps.sitesStore.find(siteId), 'the site must not have been deleted by an unauthorised caller');

    await app.close();
  });

  it('a client with a real grant can DELETE the site they were granted access to', async () => {
    const { app, deps } = await buildTestServer();
    await createUser(deps, 'owner-dev', 'developer');
    await createUser(deps, 'granted-client', 'client');
    const siteId = await createSite(deps, 'owner-dev');
    await deps.siteAccessStore.save({ id: siteAccessId('granted-client', siteId), userId: 'granted-client', siteId, grantedAt: new Date().toISOString() });
    const cookie = await loginCookie(app, 'granted-client');

    const response = await app.inject({ method: 'DELETE', url: `/api/sites/${siteId}`, headers: { cookie } });
    assert.equal(response.statusCode, 204);

    await app.close();
  });

  it('an ungranted client gets the same 404 shape as a nonexistent site', async () => {
    const { app, deps } = await buildTestServer();
    await createUser(deps, 'owner-dev', 'developer');
    await createUser(deps, 'ungranted-client', 'client');
    const siteId = await createSite(deps, 'owner-dev');
    const cookie = await loginCookie(app, 'ungranted-client');

    const ungrantedResponse = await app.inject({ method: 'DELETE', url: `/api/sites/${siteId}`, headers: { cookie } });
    const nonexistentResponse = await app.inject({ method: 'DELETE', url: `/api/sites/${randomUUID()}`, headers: { cookie } });

    assert.equal(ungrantedResponse.statusCode, 404);
    assert.equal(nonexistentResponse.statusCode, 404);
    assert.equal(ungrantedResponse.json().error, nonexistentResponse.json().error);

    await app.close();
  });

  it('a read route (GET /:id/redirects) is guarded the same way as the mutating route: 404 for a wrong-owner developer, past the guard for the real owner', async () => {
    const { app, deps } = await buildTestServer();
    await createUser(deps, 'owner-dev', 'developer');
    await createUser(deps, 'other-dev', 'developer');
    const siteId = await createSite(deps, 'owner-dev');

    const ownerCookie = await loginCookie(app, 'owner-dev');
    const otherCookie = await loginCookie(app, 'other-dev');

    const ownerResponse = await app.inject({ method: 'GET', url: `/api/sites/${siteId}/redirects`, headers: { cookie: ownerCookie } });
    // Not a real listening site, so the handler's own outbound fetch
    // fails (502) - but a 502 (not 404) is exactly what proves the
    // guard let the owner's request through to the handler at all.
    assert.equal(ownerResponse.statusCode, 502, 'the guard must pass the real owner through to the handler');

    const otherResponse = await app.inject({ method: 'GET', url: `/api/sites/${siteId}/redirects`, headers: { cookie: otherCookie } });
    assert.equal(otherResponse.statusCode, 404, 'a non-owner must be rejected by the guard before the handler ever runs');

    await app.close();
  });

  it('GET / (site list) shows a developer only the sites they own', async () => {
    const { app, deps } = await buildTestServer();
    await createUser(deps, 'dev-a', 'developer');
    await createUser(deps, 'dev-b', 'developer');
    const siteAId = await createSite(deps, 'dev-a');
    await createSite(deps, 'dev-b');

    const cookie = await loginCookie(app, 'dev-a');
    const response = await app.inject({ method: 'GET', url: '/api/sites', headers: { cookie } });

    assert.equal(response.statusCode, 200);
    const ids = (response.json() as Array<{ id: string }>).map((entry) => entry.id);
    assert.deepEqual(ids, [siteAId]);

    await app.close();
  });

  it('GET / (site list) shows a client only the sites they were granted, across multiple developers', async () => {
    const { app, deps } = await buildTestServer();
    await createUser(deps, 'dev-a', 'developer');
    await createUser(deps, 'dev-b', 'developer');
    await createUser(deps, 'multi-client', 'client');
    const grantedSiteId = await createSite(deps, 'dev-a');
    await createSite(deps, 'dev-a'); // ungranted, same developer
    const grantedFromOtherDevId = await createSite(deps, 'dev-b');

    await deps.siteAccessStore.save({ id: siteAccessId('multi-client', grantedSiteId), userId: 'multi-client', siteId: grantedSiteId, grantedAt: new Date().toISOString() });
    await deps.siteAccessStore.save({ id: siteAccessId('multi-client', grantedFromOtherDevId), userId: 'multi-client', siteId: grantedFromOtherDevId, grantedAt: new Date().toISOString() });

    const cookie = await loginCookie(app, 'multi-client');
    const response = await app.inject({ method: 'GET', url: '/api/sites', headers: { cookie } });

    assert.equal(response.statusCode, 200);
    const ids = (response.json() as Array<{ id: string }>).map((entry) => entry.id).sort();
    assert.deepEqual(ids, [grantedFromOtherDevId, grantedSiteId].sort());

    await app.close();
  });

  it('POST / (register a site) is rejected for a client with 403, not 404 - a genuine role gate, not a resource-hiding one', async () => {
    const { app, deps } = await buildTestServer();
    await createUser(deps, 'some-client', 'client');
    const cookie = await loginCookie(app, 'some-client');

    const response = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers: { cookie },
      payload: { url: 'http://127.0.0.1:1', token: 'irrelevant' },
    });

    assert.equal(response.statusCode, 403);

    await app.close();
  });

  it('POST / (register a site) stamps ownerId to the registering developer', async () => {
    const { app, deps } = await buildTestServer();
    await createUser(deps, 'registering-dev', 'developer');
    const cookie = await loginCookie(app, 'registering-dev');

    const response = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers: { cookie },
      payload: { url: 'http://127.0.0.1:1', token: 'irrelevant' },
    });

    assert.equal(response.statusCode, 201);
    const site = await deps.sitesStore.find(response.json().id);
    assert.equal(site!.ownerId, 'registering-dev');

    await app.close();
  });
});
