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
import type { SiteAccess } from '../../src/sites/site-access.ts';
import type { SiteInvite } from '../../src/sites/site-invite.ts';

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
    role: 'developer',
    status: 'active',
    createdAt: new Date().toISOString(),
  });

  const deps: ServerDeps = {
    usersStore,
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore: openInMemoryStore<Site>(),
    siteAccessStore: openInMemoryStore<SiteAccess>(),
    siteInviteStore: openInMemoryStore<SiteInvite>(),
    oauthProviders: [],
    baseUrl: '',
    mailer: undefined,
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
      role: 'developer',
      status: 'active',
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
      role: 'developer',
      status: 'active',
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
      role: 'developer',
      status: 'active',
    });

    await app.close();
  });

  describe('pause / resume', () => {
    it('pausing blocks an ordinary requireAuth route but /me and /resume stay reachable and report status: paused', async () => {
      const { app } = await buildTestServer();

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const pauseResponse = await app.inject({ method: 'POST', url: '/api/auth/pause', headers: { cookie } });
      assert.equal(pauseResponse.statusCode, 200);
      assert.deepEqual(pauseResponse.json(), { status: 'paused' });

      const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      assert.equal(meResponse.statusCode, 200);
      assert.equal(meResponse.json().status, 'paused');

      const gatedResponse = await app.inject({ method: 'GET', url: '/api/__whoami-gated', headers: { cookie } });
      assert.equal(gatedResponse.statusCode, 401);

      await app.close();
    });

    it('re-derives status on every request: a session established before pausing is blocked on its very next request, not just at login', async () => {
      const { app } = await buildTestServer();

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const beforePause = await app.inject({ method: 'GET', url: '/api/__whoami-gated', headers: { cookie } });
      assert.equal(beforePause.statusCode, 200, 'sanity check: the session works before pausing');

      await app.inject({ method: 'POST', url: '/api/auth/pause', headers: { cookie } });

      const afterPause = await app.inject({ method: 'GET', url: '/api/__whoami-gated', headers: { cookie } });
      assert.equal(afterPause.statusCode, 401, 'the same already-established session must be blocked, no re-login involved');

      await app.close();
    });

    it('resuming restores full access with no new login required', async () => {
      const { app } = await buildTestServer();

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      await app.inject({ method: 'POST', url: '/api/auth/pause', headers: { cookie } });
      const blockedResponse = await app.inject({ method: 'GET', url: '/api/__whoami-gated', headers: { cookie } });
      assert.equal(blockedResponse.statusCode, 401);

      const resumeResponse = await app.inject({ method: 'POST', url: '/api/auth/resume', headers: { cookie } });
      assert.equal(resumeResponse.statusCode, 200);
      assert.deepEqual(resumeResponse.json(), { status: 'active' });

      const restoredResponse = await app.inject({ method: 'GET', url: '/api/__whoami-gated', headers: { cookie } });
      assert.equal(restoredResponse.statusCode, 200);
      assert.equal(restoredResponse.json().status, 'active');

      await app.close();
    });

    it('pausing an already-paused account is a no-op, not an error', async () => {
      const { app } = await buildTestServer();

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const first = await app.inject({ method: 'POST', url: '/api/auth/pause', headers: { cookie } });
      const second = await app.inject({ method: 'POST', url: '/api/auth/pause', headers: { cookie } });
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      assert.deepEqual(second.json(), { status: 'paused' });

      await app.close();
    });

    it('resuming an already-active account is a no-op, not an error', async () => {
      const { app } = await buildTestServer();

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const response = await app.inject({ method: 'POST', url: '/api/auth/resume', headers: { cookie } });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { status: 'active' });

      await app.close();
    });
  });

  describe('PATCH /api/auth/me', () => {
    it('updates name and email, returning the full current-user shape', async () => {
      const { app } = await buildTestServer();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: { cookie },
        payload: { name: 'New Name', email: 'new-email@example.com' },
      });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        id: normaliseUsername(TEST_USERNAME),
        username: TEST_USERNAME,
        name: 'New Name',
        email: 'new-email@example.com',
        role: 'developer',
        status: 'active',
      });

      await app.close();
    });

    it('a partial update (name only) leaves email untouched, and vice versa', async () => {
      const { app } = await buildTestServer();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const nameOnly = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { cookie }, payload: { name: 'Only Name Changed' } });
      assert.equal(nameOnly.statusCode, 200);
      assert.equal(nameOnly.json().name, 'Only Name Changed');
      assert.equal(nameOnly.json().email, TEST_EMAIL);

      const emailOnly = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: { cookie },
        payload: { email: 'only-email-changed@example.com' },
      });
      assert.equal(emailOnly.statusCode, 200);
      assert.equal(emailOnly.json().name, 'Only Name Changed', 'the name set by the previous request must survive');
      assert.equal(emailOnly.json().email, 'only-email-changed@example.com');

      await app.close();
    });

    it('rejects an empty/whitespace-only name or email with 400 and no mutation', async () => {
      const { app } = await buildTestServer();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const response = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { cookie }, payload: { name: '   ' } });
      assert.equal(response.statusCode, 400);

      const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      assert.equal(meResponse.json().name, TEST_NAME, 'must not have been mutated');

      await app.close();
    });

    it('username is never accepted or changed, even if supplied in the body', async () => {
      const { app } = await buildTestServer();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: { cookie },
        payload: { name: 'Still Jane', username: 'attempted-rename' },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().username, TEST_USERNAME);
      assert.equal(response.json().id, normaliseUsername(TEST_USERNAME));

      await app.close();
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('changes the password: the new one works on a fresh login, the old one no longer does', async () => {
      const { app } = await buildTestServer();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const changeResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { cookie },
        payload: { currentPassword: TEST_PASSWORD, newPassword: 'a brand new password' },
      });
      assert.equal(changeResponse.statusCode, 200);
      assert.deepEqual(changeResponse.json(), { ok: true });

      const oldPasswordLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      assert.equal(oldPasswordLogin.statusCode, 401);

      const newPasswordLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: 'a brand new password' },
      });
      assert.equal(newPasswordLogin.statusCode, 200);

      await app.close();
    });

    it('rejects the wrong current password with 401 and makes no change', async () => {
      const { app } = await buildTestServer();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { cookie },
        payload: { currentPassword: 'totally wrong', newPassword: 'a brand new password' },
      });
      assert.equal(response.statusCode, 401);

      const stillWorksLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      assert.equal(stillWorksLogin.statusCode, 200, 'the original password must still work - nothing was changed');

      await app.close();
    });

    it('invalidates every other session belonging to the account, but leaves the session that made the change alone', async () => {
      const { app } = await buildTestServer();

      const firstLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const firstCookie = extractCookie(firstLogin.headers['set-cookie']);

      const secondLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const secondCookie = extractCookie(secondLogin.headers['set-cookie']);

      // The change is made from the *second* session.
      const changeResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { cookie: secondCookie },
        payload: { currentPassword: TEST_PASSWORD, newPassword: 'a brand new password' },
      });
      assert.equal(changeResponse.statusCode, 200);

      const firstAfter = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: firstCookie } });
      assert.equal(firstAfter.statusCode, 401, 'the other, untouched session must be logged out');

      const secondAfter = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: secondCookie } });
      assert.equal(secondAfter.statusCode, 200, 'the session that made the change must stay logged in');

      await app.close();
    });
  });
});
