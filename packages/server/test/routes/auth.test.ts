import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { buildServer, type ServerDeps } from '../../src/server.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { openInMemoryUserStore } from '../../src/store/user-store.ts';
import { openInMemorySiteStore } from '../../src/store/site-store.ts';
import { openInMemorySiteAccessStore } from '../../src/store/site-access-store.ts';
import { openInMemorySiteInviteStore } from '../../src/store/site-invite-store.ts';
import { hashPassword } from '../../src/auth/password.ts';
import { PASSWORD_REQUIREMENTS_MESSAGE } from '../../src/auth/password-strength.ts';
import { normaliseUsername } from '../../src/auth/users.ts';
import { createRequireAuth } from '../../src/auth/require-auth.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';

const TEST_USERNAME = 'editor';
const TEST_PASSWORD = 'correct horse battery staple';
// Login itself has no strength rule (TEST_PASSWORD above proves that -
// it deliberately doesn't meet isStrongPassword), but every route that
// creates or changes a password does, so those tests need a payload
// that actually passes: 3+ of upper/lower/number/symbol.
const STRONG_PASSWORD = 'Str0ng Passw0rd!';
const TEST_FIRST_NAME = 'Jane';
const TEST_LAST_NAME = 'Editor';
const TEST_EMAIL = 'jane@example.com';

async function buildTestServer(): Promise<{ deps: ServerDeps; app: Awaited<ReturnType<typeof buildServer>> }> {
  const usersStore = openInMemoryUserStore();
  const { hash, salt } = hashPassword(TEST_PASSWORD);
  await usersStore.save({
    id: normaliseUsername(TEST_USERNAME),
    username: TEST_USERNAME,
    passwordHash: hash,
    passwordSalt: salt,
    firstName: TEST_FIRST_NAME,
    lastName: TEST_LAST_NAME,
    email: TEST_EMAIL,
    role: 'developer',
    status: 'active',
    timezone: 'UTC',
    createdAt: new Date().toISOString(),
  });

  const deps: ServerDeps = {
    usersStore,
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore: openInMemorySiteStore(),
    siteAccessStore: openInMemorySiteAccessStore(),
    siteInviteStore: openInMemorySiteInviteStore(),
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
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME,
      email: TEST_EMAIL,
      role: 'developer',
      status: 'active',
      timezone: 'UTC',
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
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME,
      email: TEST_EMAIL,
      role: 'developer',
      status: 'active',
      timezone: 'UTC',
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
      firstName: TEST_FIRST_NAME,
      lastName: TEST_LAST_NAME,
      email: TEST_EMAIL,
      role: 'developer',
      status: 'active',
      timezone: 'UTC',
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
    it('updates firstName, lastName, and email, returning the full current-user shape', async () => {
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
        payload: { firstName: 'Updated', lastName: 'Person', email: 'new-email@example.com' },
      });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        id: normaliseUsername(TEST_USERNAME),
        username: TEST_USERNAME,
        firstName: 'Updated',
        lastName: 'Person',
        email: 'new-email@example.com',
        role: 'developer',
        status: 'active',
        timezone: 'UTC',
      });

      await app.close();
    });

    it('a partial update (firstName only, or lastName only) leaves the others untouched', async () => {
      const { app } = await buildTestServer();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const firstNameOnly = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: { cookie },
        payload: { firstName: 'Updated' },
      });
      assert.equal(firstNameOnly.statusCode, 200);
      assert.equal(firstNameOnly.json().firstName, 'Updated');
      assert.equal(firstNameOnly.json().lastName, TEST_LAST_NAME);
      assert.equal(firstNameOnly.json().email, TEST_EMAIL);

      const lastNameOnly = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: { cookie },
        payload: { lastName: 'Surname' },
      });
      assert.equal(lastNameOnly.statusCode, 200);
      assert.equal(lastNameOnly.json().firstName, 'Updated', 'the firstName set by the previous request must survive');
      assert.equal(lastNameOnly.json().lastName, 'Surname');

      const emailOnly = await app.inject({
        method: 'PATCH',
        url: '/api/auth/me',
        headers: { cookie },
        payload: { email: 'only-email-changed@example.com' },
      });
      assert.equal(emailOnly.statusCode, 200);
      assert.equal(emailOnly.json().firstName, 'Updated', 'still survives');
      assert.equal(emailOnly.json().lastName, 'Surname', 'still survives');
      assert.equal(emailOnly.json().email, 'only-email-changed@example.com');

      await app.close();
    });

    it('rejects an empty/whitespace-only firstName or email with 400 and no mutation', async () => {
      const { app } = await buildTestServer();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const response = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { cookie }, payload: { firstName: '   ' } });
      assert.equal(response.statusCode, 400);

      const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      assert.equal(meResponse.json().firstName, TEST_FIRST_NAME, 'must not have been mutated');

      await app.close();
    });

    it('an empty lastName is accepted - single-name individuals are not required to supply one', async () => {
      const { app } = await buildTestServer();
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
      });
      const cookie = extractCookie(loginResponse.headers['set-cookie']);

      const response = await app.inject({ method: 'PATCH', url: '/api/auth/me', headers: { cookie }, payload: { lastName: '' } });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().lastName, '');

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
        payload: { firstName: 'Still', lastName: 'Jane', username: 'attempted-rename' },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().username, TEST_USERNAME);
      assert.equal(response.json().id, normaliseUsername(TEST_USERNAME));

      await app.close();
    });

    it('updates timezone to a real IANA zone name', async () => {
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
        payload: { timezone: 'Australia/Sydney' },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().timezone, 'Australia/Sydney');

      const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      assert.equal(meResponse.json().timezone, 'Australia/Sydney');

      await app.close();
    });

    it('rejects an invalid timezone with 400 and no mutation', async () => {
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
        payload: { timezone: 'Not/A_Real_Zone' },
      });
      assert.equal(response.statusCode, 400);

      const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      assert.equal(meResponse.json().timezone, 'UTC', 'must not have been mutated');

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
        payload: { currentPassword: TEST_PASSWORD, newPassword: STRONG_PASSWORD },
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
        payload: { username: TEST_USERNAME, password: STRONG_PASSWORD },
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
        payload: { currentPassword: 'totally wrong', newPassword: STRONG_PASSWORD },
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

    it('rejects a weak new password with 400 and makes no change', async () => {
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
        payload: { currentPassword: TEST_PASSWORD, newPassword: 'all lowercase' },
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().message, PASSWORD_REQUIREMENTS_MESSAGE);

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
        payload: { currentPassword: TEST_PASSWORD, newPassword: STRONG_PASSWORD },
      });
      assert.equal(changeResponse.statusCode, 200);

      const firstAfter = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: firstCookie } });
      assert.equal(firstAfter.statusCode, 401, 'the other, untouched session must be logged out');

      const secondAfter = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: secondCookie } });
      assert.equal(secondAfter.statusCode, 200, 'the session that made the change must stay logged in');

      await app.close();
    });
  });

  describe('POST /api/auth/signup', () => {
    it('creates a role: developer account (username derived from email) and logs them in', async () => {
      const { app, deps } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { firstName: 'New', lastName: 'Dev', email: 'new-dev@example.com', password: STRONG_PASSWORD },
      });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        id: normaliseUsername('new-dev@example.com'),
        username: 'new-dev@example.com',
        firstName: 'New',
        lastName: 'Dev',
        email: 'new-dev@example.com',
        role: 'developer',
        status: 'active',
        timezone: 'UTC',
      });
      assert.ok(response.headers['set-cookie'], 'expected signup to establish a session');

      const saved = await deps.usersStore.find(normaliseUsername('new-dev@example.com'));
      assert.ok(saved);
      assert.equal(saved!.role, 'developer');
      assert.equal(saved!.status, 'active');

      await app.close();
    });

    it('a signup with no lastName supplied defaults it to an empty string', async () => {
      const { app } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { firstName: 'Cher', email: 'cher@example.com', password: STRONG_PASSWORD },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().firstName, 'Cher');
      assert.equal(response.json().lastName, '');

      await app.close();
    });

    it('an email that already has an account is rejected with 409 and no mutation', async () => {
      const { app } = await buildTestServer();

      const first = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { firstName: 'First', email: 'taken@example.com', password: STRONG_PASSWORD },
      });
      assert.equal(first.statusCode, 200);

      const second = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { firstName: 'Second', email: 'taken@example.com', password: 'An0ther Str0ng Pass!' },
      });
      assert.equal(second.statusCode, 409);

      // The original account's name must survive - the conflicting
      // signup must not have overwritten anything.
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'taken@example.com', password: STRONG_PASSWORD },
      });
      assert.equal(loginResponse.statusCode, 200);
      assert.equal(loginResponse.json().firstName, 'First');

      await app.close();
    });

    it('a password under 8 characters is rejected with 400 and the requirements message', async () => {
      const { app } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { firstName: 'Short', email: 'short@example.com', password: 'short1' },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().message, PASSWORD_REQUIREMENTS_MESSAGE);

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'short@example.com', password: 'short1' },
      });
      assert.equal(loginResponse.statusCode, 401, 'no account should have been created');

      await app.close();
    });

    it('a password of sufficient length using only one character class is rejected with 400', async () => {
      const { app } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { firstName: 'Weak', email: 'lowercase@example.com', password: 'aaaaaaaaaa' },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().message, PASSWORD_REQUIREMENTS_MESSAGE);

      await app.close();
    });

    it('an empty firstName or email is rejected with 400', async () => {
      const { app } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { firstName: '', email: 'someone@example.com', password: STRONG_PASSWORD },
      });

      assert.equal(response.statusCode, 400);

      await app.close();
    });

    it('uses a supplied timezone (SignupPage.tsx captures the browser\'s own via Intl.DateTimeFormat) instead of the default', async () => {
      const { app, deps } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { firstName: 'Sydney', lastName: 'Dev', email: 'sydney-dev@example.com', password: STRONG_PASSWORD, timezone: 'Australia/Sydney' },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().timezone, 'Australia/Sydney');

      const saved = await deps.usersStore.find(normaliseUsername('sydney-dev@example.com'));
      assert.equal(saved?.timezone, 'Australia/Sydney');

      await app.close();
    });

    it('an invalid timezone is rejected with 400 and no account is created', async () => {
      const { app, deps } = await buildTestServer();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { firstName: 'Bad', lastName: 'Zone', email: 'bad-zone@example.com', password: STRONG_PASSWORD, timezone: 'Not/A_Real_Zone' },
      });

      assert.equal(response.statusCode, 400);

      const saved = await deps.usersStore.find(normaliseUsername('bad-zone@example.com'));
      assert.equal(saved, undefined, 'no account should have been created');

      await app.close();
    });
  });
});
