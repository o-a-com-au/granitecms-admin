import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildServer, type ServerDeps } from '../../src/server.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { hashPassword } from '../../src/auth/password.ts';
import { normaliseUsername, type AdminUser } from '../../src/auth/users.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';
import type { Site } from '../../src/sites/site.ts';
import { siteAccessId, type SiteAccess } from '../../src/sites/site-access.ts';

const DEVELOPER_USERNAME = 'dev-one';
const DEVELOPER_PASSWORD = 'correct horse battery staple';
const DEVELOPER_NAME = 'Dev One';
const DEVELOPER_EMAIL = 'dev-one@example.com';

interface TestServer {
  app: Awaited<ReturnType<typeof buildServer>>;
  deps: ServerDeps;
  cookie: string;
  siteId: string;
}

async function loginCookie(app: Awaited<ReturnType<typeof buildServer>>, username: string, password: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });
  const header = response.headers['set-cookie'];
  const raw = Array.isArray(header) ? header[0] : header;
  assert.ok(raw, 'expected a session cookie from login');
  return raw.split(';')[0] as string;
}

// Builds a server with one developer (logged in, cookie returned) who
// owns exactly one site - the shared starting point for every test
// below, which then each add whatever extra users/access they need.
async function buildTestServer(): Promise<TestServer> {
  const usersStore = openInMemoryStore<AdminUser>();
  const { hash, salt } = hashPassword(DEVELOPER_PASSWORD);
  const developerId = normaliseUsername(DEVELOPER_USERNAME);
  await usersStore.save({
    id: developerId,
    username: DEVELOPER_USERNAME,
    passwordHash: hash,
    passwordSalt: salt,
    name: DEVELOPER_NAME,
    email: DEVELOPER_EMAIL,
    role: 'developer',
    status: 'active',
    createdAt: new Date().toISOString(),
  });

  const sitesStore = openInMemoryStore<Site>();
  const siteId = randomUUID();
  await sitesStore.save({
    id: siteId,
    url: 'http://127.0.0.1:1',
    token: 'unused-in-these-tests',
    ownerId: developerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const deps: ServerDeps = {
    usersStore,
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore,
    siteAccessStore: openInMemoryStore<SiteAccess>(),
  };

  const app = await buildServer(undefined, deps);
  const cookie = await loginCookie(app, DEVELOPER_USERNAME, DEVELOPER_PASSWORD);

  return { app, deps, cookie, siteId };
}

async function inviteBody(username: string, extra: Record<string, unknown> = {}) {
  return { username, name: `${username} name`, email: `${username}@example.com`, ...extra };
}

describe('site-users routes', () => {
  it('POST /:siteId/users creates a fresh client account, grants access, and returns a one-time password', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody('new-client'),
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.username, 'new-client');
    assert.equal(body.name, 'new-client name');
    assert.equal(body.email, 'new-client@example.com');
    assert.equal(typeof body.password, 'string');
    assert.ok(body.password.length > 0);
    assert.equal(body.passwordHash, undefined);
    assert.equal(body.passwordSalt, undefined);

    const savedUser = await deps.usersStore.find(normaliseUsername('new-client'));
    assert.ok(savedUser);
    assert.equal(savedUser!.role, 'client');
    assert.equal(savedUser!.status, 'active');

    const access = await deps.siteAccessStore.find(siteAccessId(normaliseUsername('new-client'), siteId));
    assert.ok(access, 'expected a SiteAccess grant to have been created');

    await app.close();
  });

  it('POST /:siteId/users with an explicit password uses it instead of generating one', async () => {
    const { app, cookie, siteId } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody('picks-own-password', { password: 'a chosen password' }),
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().password, 'a chosen password');

    await app.close();
  });

  it('POST /:siteId/users granting an existing client access to a second site leaves their account untouched and omits the password', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();

    const firstInvite = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody('repeat-client'),
    });
    const originalPasswordHash = (await deps.usersStore.find(normaliseUsername('repeat-client')))!.passwordHash;
    assert.equal(firstInvite.statusCode, 201);

    const secondSiteId = randomUUID();
    await deps.sitesStore.save({
      id: secondSiteId,
      url: 'http://127.0.0.1:2',
      token: 'unused',
      ownerId: normaliseUsername(DEVELOPER_USERNAME),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const secondInvite = await app.inject({
      method: 'POST',
      url: `/api/sites/${secondSiteId}/users`,
      headers: { cookie },
      payload: await inviteBody('repeat-client'),
    });

    assert.equal(secondInvite.statusCode, 200);
    assert.equal(secondInvite.json().password, undefined, 'granting an existing client access must not return a password');

    const userAfter = await deps.usersStore.find(normaliseUsername('repeat-client'));
    assert.equal(userAfter!.passwordHash, originalPasswordHash, 'an existing client account must be left untouched');

    const secondAccess = await deps.siteAccessStore.find(siteAccessId(normaliseUsername('repeat-client'), secondSiteId));
    assert.ok(secondAccess, 'expected a new grant for the second site');

    await app.close();
  });

  it('POST /:siteId/users re-inviting a client who already has access to that exact site is a no-op, not a bumped grantedAt', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();

    const first = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody('already-granted'),
    });
    assert.equal(first.statusCode, 201);
    const originalGrant = await deps.siteAccessStore.find(siteAccessId(normaliseUsername('already-granted'), siteId));
    assert.ok(originalGrant);

    const second = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody('already-granted'),
    });
    assert.equal(second.statusCode, 200);

    const grantAfter = await deps.siteAccessStore.find(siteAccessId(normaliseUsername('already-granted'), siteId));
    assert.equal(grantAfter!.grantedAt, originalGrant!.grantedAt, 'grantedAt must not change on a re-invite to the same site');

    await app.close();
  });

  it('POST /:siteId/users conflicting with an existing developer username is rejected with 409 and no mutation', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody(DEVELOPER_USERNAME),
    });

    assert.equal(response.statusCode, 409);

    const access = await deps.siteAccessStore.find(siteAccessId(normaliseUsername(DEVELOPER_USERNAME), siteId));
    assert.equal(access, undefined, 'no access grant should have been created for a rejected invite');

    await app.close();
  });

  it('POST /:siteId/users rejects a malformed username with 400', async () => {
    const { app, cookie, siteId } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody('not a valid username!'),
    });

    assert.equal(response.statusCode, 400);

    await app.close();
  });

  it('GET /:siteId/users lists granted clients without leaking password fields', async () => {
    const { app, cookie, siteId } = await buildTestServer();

    await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody('listed-client'),
    });

    const response = await app.inject({ method: 'GET', url: `/api/sites/${siteId}/users`, headers: { cookie } });
    assert.equal(response.statusCode, 200);
    const { clients } = response.json();
    assert.equal(clients.length, 1);
    assert.equal(clients[0].username, 'listed-client');
    assert.equal(clients[0].passwordHash, undefined);
    assert.equal(clients[0].passwordSalt, undefined);
    assert.equal(typeof clients[0].grantedAt, 'string');

    await app.close();
  });

  it('DELETE /:siteId/users/:userId revokes one of two grants without deleting the account', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();

    await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody('two-site-client'),
    });

    const secondSiteId = randomUUID();
    await deps.sitesStore.save({
      id: secondSiteId,
      url: 'http://127.0.0.1:3',
      token: 'unused',
      ownerId: normaliseUsername(DEVELOPER_USERNAME),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await app.inject({
      method: 'POST',
      url: `/api/sites/${secondSiteId}/users`,
      headers: { cookie },
      payload: await inviteBody('two-site-client'),
    });

    const clientId = normaliseUsername('two-site-client');
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${siteId}/users/${clientId}`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, accountDeleted: false });

    assert.equal(await deps.siteAccessStore.find(siteAccessId(clientId, siteId)), undefined);
    assert.ok(await deps.siteAccessStore.find(siteAccessId(clientId, secondSiteId)), 'the second grant must survive');
    assert.ok(await deps.usersStore.find(clientId), 'the account must still exist while another grant remains');

    await app.close();
  });

  it('DELETE /:siteId/users/:userId revoking the last remaining grant also deletes the now-orphaned account', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();

    await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie },
      payload: await inviteBody('one-site-client'),
    });

    const clientId = normaliseUsername('one-site-client');
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${siteId}/users/${clientId}`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, accountDeleted: true });

    assert.equal(await deps.siteAccessStore.find(siteAccessId(clientId, siteId)), undefined);
    assert.equal(await deps.usersStore.find(clientId), undefined);

    await app.close();
  });

  it('DELETE /:siteId/users/:userId with no matching grant returns 404', async () => {
    const { app, cookie, siteId } = await buildTestServer();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${siteId}/users/nobody-invited`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('a granted client hitting invite/list/revoke on a site they have real content access to is rejected with 403, not treated as authorised', async () => {
    const { app, deps, siteId } = await buildTestServer();

    const { hash, salt } = hashPassword('client password 1');
    const clientId = normaliseUsername('genuine-client');
    await deps.usersStore.save({
      id: clientId,
      username: 'genuine-client',
      passwordHash: hash,
      passwordSalt: salt,
      name: 'Genuine Client',
      email: 'genuine-client@example.com',
      role: 'client',
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    await deps.siteAccessStore.save({ id: siteAccessId(clientId, siteId), userId: clientId, siteId, grantedAt: new Date().toISOString() });

    const clientCookie = await loginCookie(app, 'genuine-client', 'client password 1');

    const list = await app.inject({ method: 'GET', url: `/api/sites/${siteId}/users`, headers: { cookie: clientCookie } });
    assert.equal(list.statusCode, 403);

    const invite = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/users`,
      headers: { cookie: clientCookie },
      payload: await inviteBody('someone-else'),
    });
    assert.equal(invite.statusCode, 403);

    const revoke = await app.inject({ method: 'DELETE', url: `/api/sites/${siteId}/users/${clientId}`, headers: { cookie: clientCookie } });
    assert.equal(revoke.statusCode, 403);

    await app.close();
  });

  it('a developer inviting a client to a site they do not own gets the same 404 as a nonexistent site', async () => {
    const { app, deps, cookie } = await buildTestServer();

    const { hash, salt } = hashPassword('other developer password');
    const otherDeveloperId = normaliseUsername('other-dev');
    await deps.usersStore.save({
      id: otherDeveloperId,
      username: 'other-dev',
      passwordHash: hash,
      passwordSalt: salt,
      name: 'Other Dev',
      email: 'other-dev@example.com',
      role: 'developer',
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    const otherSiteId = randomUUID();
    await deps.sitesStore.save({
      id: otherSiteId,
      url: 'http://127.0.0.1:4',
      token: 'unused',
      ownerId: otherDeveloperId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${otherSiteId}/users`,
      headers: { cookie },
      payload: await inviteBody('irrelevant'),
    });

    assert.equal(response.statusCode, 404);

    const nonexistentResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${randomUUID()}/users`,
      headers: { cookie },
      payload: await inviteBody('irrelevant'),
    });
    assert.equal(nonexistentResponse.statusCode, 404);
    // Both bodies come from the identical SiteNotFoundError shape (the
    // id text differs only because it echoes back the id already
    // present in the request URL, not new information) - what matters
    // is that "wrong owner" and "doesn't exist" are the same error
    // type/shape, not two different code paths a client could tell apart.
    assert.deepEqual(Object.keys(response.json()).sort(), Object.keys(nonexistentResponse.json()).sort());
    assert.equal(response.json().error, nonexistentResponse.json().error);

    await app.close();
  });
});
