import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { buildServer, type ServerDeps } from '../../src/server.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { hashPassword } from '../../src/auth/password.ts';
import { normaliseUsername, type AdminUser } from '../../src/auth/users.ts';
import { createRequireAuth } from '../../src/auth/require-auth.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';
import type { Site } from '../../src/sites/site.ts';

const TEST_USERNAME = 'editor';
const TEST_PASSWORD = 'correct horse battery staple';
const TEST_NAME = 'Jane Editor';
const TEST_EMAIL = 'jane@example.com';

async function buildTestServer(): Promise<{ deps: ServerDeps; app: Awaited<ReturnType<typeof buildServer>> }> {
  const usersStore = openInMemoryStore<AdminUser>();
  const { hash, salt } = hashPassword(TEST_PASSWORD);
  await usersStore.save({
    id: normaliseUsername(TEST_USERNAME),
    username: TEST_USERNAME,
    passwordHash: hash,
    passwordSalt: salt,
    name: TEST_NAME,
    email: TEST_EMAIL,
    createdAt: new Date().toISOString(),
  });

  const deps: ServerDeps = {
    usersStore,
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore: openInMemoryStore<Site>(),
  };

  const app = await buildServer(undefined, deps);
  // B4 proof: no downstream route exists yet that needs the
  // authenticated identity, so a throwaway gated route proves the
  // mechanism (request.currentUser) directly - matching the agent
  // repo's own precedent for exactly this situation.
  app.get('/api/__whoami-gated', { preHandler: createRequireAuth(deps.usersStore) }, async (request) => request.currentUser);

  return { deps, app };
}

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  assert.ok(header, 'expected a set-cookie header');
  return header.split(';')[0] as string;
}

describe('auth routes', () => {
  it('B2: a correct login succeeds and establishes a session', async () => {
    const { app } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      id: normaliseUsername(TEST_USERNAME),
      username: TEST_USERNAME,
      name: TEST_NAME,
      email: TEST_EMAIL,
    });
    assert.ok(response.headers['set-cookie'], 'expected a session cookie to be set');

    await app.close();
  });

  it('B2: an unknown username is rejected with 401 and a generic message', async () => {
    const { app } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'whatever' },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: 'Invalid username or password' });

    await app.close();
  });

  it('B2: a wrong password is rejected with 401 and the identical generic message', async () => {
    const { app } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: TEST_USERNAME, password: 'wrong password' },
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: 'Invalid username or password' });

    await app.close();
  });

  it('B3: a logged-in session is usable on a later request (GET /api/auth/me)', async () => {
    const { app } = await buildTestServer();

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });
    const cookie = extractCookie(loginResponse.headers['set-cookie']);

    const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    assert.equal(meResponse.statusCode, 200);
    assert.deepEqual(meResponse.json(), {
      id: normaliseUsername(TEST_USERNAME),
      username: TEST_USERNAME,
      name: TEST_NAME,
      email: TEST_EMAIL,
    });

    await app.close();
  });

  it('GET /api/auth/me with no session is rejected with 401', async () => {
    const { app } = await buildTestServer();

    const response = await app.inject({ method: 'GET', url: '/api/auth/me' });
    assert.equal(response.statusCode, 401);

    await app.close();
  });

  it('B3: logging out ends the session - a subsequent request with the same cookie is unauthenticated', async () => {
    const { app } = await buildTestServer();

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });
    const cookie = extractCookie(loginResponse.headers['set-cookie']);

    const logoutResponse = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    assert.equal(logoutResponse.statusCode, 200);

    const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    assert.equal(meResponse.statusCode, 401);

    await app.close();
  });

  it('POST /api/auth/logout with no session at all is still a no-op 200, not an error', async () => {
    const { app } = await buildTestServer();

    const response = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });

    await app.close();
  });

  it('B4: the authenticated identity is available to a downstream route via requireAuth', async () => {
    const { app } = await buildTestServer();

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });
    const cookie = extractCookie(loginResponse.headers['set-cookie']);

    const whoamiResponse = await app.inject({ method: 'GET', url: '/api/__whoami-gated', headers: { cookie } });
    assert.equal(whoamiResponse.statusCode, 200);
    assert.deepEqual(whoamiResponse.json(), {
      id: normaliseUsername(TEST_USERNAME),
      username: TEST_USERNAME,
      name: TEST_NAME,
      email: TEST_EMAIL,
    });

    await app.close();
  });
});
