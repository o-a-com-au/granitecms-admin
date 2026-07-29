import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { buildServer, type ServerDeps } from '../../src/server.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { hashPassword } from '../../src/auth/password.ts';
import { normaliseUsername, type AdminUser } from '../../src/auth/users.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';
import type { Site } from '../../src/sites/site.ts';

const TEST_USERNAME = 'editor';
const TEST_PASSWORD = 'correct horse battery staple';

async function buildTestServer(): Promise<{
  app: Awaited<ReturnType<typeof buildServer>>;
  cookie: string;
}> {
  const usersStore = openInMemoryStore<AdminUser>();
  const { hash, salt } = hashPassword(TEST_PASSWORD);
  await usersStore.save({
    id: normaliseUsername(TEST_USERNAME),
    username: TEST_USERNAME,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  });

  const deps: ServerDeps = {
    usersStore,
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore: openInMemoryStore<Site>(),
  };

  const app = await buildServer(undefined, deps);

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
  });
  const setCookieHeader = loginResponse.headers['set-cookie'];
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  assert.ok(header, 'expected a session cookie from login');
  const cookie = header.split(';')[0] as string;

  return { app, cookie };
}

let fakeSite: Server | undefined;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// A real local cms-agent-shaped site, not a mock - accepts exactly
// one token at a time, so rotation tests can prove the NEW token is
// what's actually used, not something cached from registration.
async function startFakeSite(acceptedToken: string): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/v1/capabilities') {
      sendJson(res, 200, { agentVersion: '1.0.0', contentSchemaVersion: 3, sqliteDriver: 'node:sqlite' });
      return;
    }
    if (req.url === '/v1/content') {
      const auth = req.headers.authorization;
      if (auth === `Bearer ${acceptedToken}`) {
        sendJson(res, 200, []);
      } else {
        sendJson(res, 401, { error: 'invalid-token' });
      }
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  };

  fakeSite = createServer(handler);
  await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
  const address = fakeSite.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a real listening address');
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (fakeSite) {
    await new Promise<void>((resolve) => fakeSite!.close(() => resolve()));
    fakeSite = undefined;
  }
});

describe('sites routes', () => {
  it('every route requires authentication', async () => {
    const { app } = await buildTestServer();

    const list = await app.inject({ method: 'GET', url: '/api/sites' });
    assert.equal(list.statusCode, 401);

    const create = await app.inject({
      method: 'POST',
      url: '/api/sites',
      payload: { url: 'http://example.com', token: 'x' },
    });
    assert.equal(create.statusCode, 401);

    const rotate = await app.inject({
      method: 'PUT',
      url: '/api/sites/anything/token',
      payload: { token: 'x' },
    });
    assert.equal(rotate.statusCode, 401);

    const remove = await app.inject({ method: 'DELETE', url: '/api/sites/anything' });
    assert.equal(remove.statusCode, 401);

    await app.close();
  });

  it('C1, C2: registering a site stores it, lists it, and shows real live status', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeSite('token-abc');

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers: { cookie },
      payload: { url: siteUrl, token: 'token-abc' },
    });

    assert.equal(createResponse.statusCode, 201);
    const created = createResponse.json();
    assert.equal(created.url, siteUrl);
    assert.deepEqual(created.status, {
      state: 'ok',
      agentVersion: '1.0.0',
      contentSchemaVersion: 3,
      sqliteDriver: 'node:sqlite',
    });
    assert.equal('token' in created, false, 'the raw token must never appear in the response');

    const listResponse = await app.inject({ method: 'GET', url: '/api/sites', headers: { cookie } });
    assert.equal(listResponse.statusCode, 200);
    const listed = listResponse.json();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);
    assert.equal(listed[0].status.state, 'ok');
    assert.equal('token' in listed[0], false);

    await app.close();
  });

  it('POST /api/sites rejects a missing url/token with 400', async () => {
    const { app, cookie } = await buildTestServer();

    const missingToken = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers: { cookie },
      payload: { url: 'http://example.com' },
    });
    assert.equal(missingToken.statusCode, 400);

    const badScheme = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers: { cookie },
      payload: { url: 'ftp://example.com', token: 'x' },
    });
    assert.equal(badScheme.statusCode, 400);

    await app.close();
  });

  it('POST /api/sites is not gated on reachability - an unreachable site is still registered', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers: { cookie },
      payload: { url: 'http://127.0.0.1:1', token: 'x' },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().status.state, 'unreachable');

    await app.close();
  });

  it('C3: rotating a token updates only the token, proven live against the fake site, and keeps other fields', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeSite('old-token');

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers: { cookie },
      payload: { url: siteUrl, token: 'old-token' },
    });
    const created = createResponse.json();
    assert.equal(created.status.state, 'ok');

    // Rotate to a token the fake site does not recognise yet - proves
    // the NEW token is what's actually used, not something cached.
    const rotateToUnknown = await app.inject({
      method: 'PUT',
      url: `/api/sites/${created.id}/token`,
      headers: { cookie },
      payload: { token: 'unknown-token' },
    });
    assert.equal(rotateToUnknown.statusCode, 200);
    const rotated = rotateToUnknown.json();
    assert.equal(rotated.status.state, 'unauthorized');
    assert.equal(rotated.id, created.id);
    assert.equal(rotated.url, created.url);
    assert.equal(rotated.createdAt, created.createdAt);
    assert.notEqual(rotated.updatedAt, created.updatedAt);
    assert.equal('token' in rotated, false);

    await app.close();
  });

  it('PUT /api/sites/:id/token returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/sites/does-not-exist/token',
      headers: { cookie },
      payload: { token: 'x' },
    });

    assert.equal(response.statusCode, 404);
  });

  it('C4: deleting a site removes it from the registry without touching the site itself', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeSite('token-abc');

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers: { cookie },
      payload: { url: siteUrl, token: 'token-abc' },
    });
    const created = createResponse.json();

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${created.id}`,
      headers: { cookie },
    });
    assert.equal(deleteResponse.statusCode, 204);

    const listResponse = await app.inject({ method: 'GET', url: '/api/sites', headers: { cookie } });
    assert.deepEqual(listResponse.json(), []);

    await app.close();
  });

  it('DELETE /api/sites/:id returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({ method: 'DELETE', url: '/api/sites/does-not-exist', headers: { cookie } });
    assert.equal(response.statusCode, 404);
  });
});
