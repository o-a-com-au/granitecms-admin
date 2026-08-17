import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { buildServer, type ServerDeps } from '../../src/server.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { hashPassword } from '../../src/auth/password.ts';
import { PASSWORD_REQUIREMENTS_MESSAGE } from '../../src/auth/password-strength.ts';
import { normaliseUsername, type AdminUser } from '../../src/auth/users.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';
import type { Site } from '../../src/sites/site.ts';
import { siteAccessId, type SiteAccess } from '../../src/sites/site-access.ts';
import type { SiteInvite } from '../../src/sites/site-invite.ts';
import type { Mailer } from '../../src/email/mailer.ts';

const DEVELOPER_USERNAME = 'dev-one';
const DEVELOPER_PASSWORD = 'correct horse battery staple';
// Claiming an invite creates a real password, which the route now
// strength-checks - unlike DEVELOPER_PASSWORD above, which only ever
// gets hashed directly into a pre-seeded test user and never touches
// that validation.
const STRONG_PASSWORD = 'Str0ng Passw0rd!';

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

// A plain object satisfying the Mailer interface directly, not a real
// SMTP round trip - createMailer's own real-SMTP behaviour is
// test/email/mailer.test.ts's concern; these route tests only need to
// prove routes/site-invites.ts calls it correctly and reports
// emailSent accordingly.
function fakeMailer(): { mailer: Mailer; sentTo: () => string[] } {
  const sent: string[] = [];
  return {
    mailer: {
      async sendInviteEmail({ to }) {
        sent.push(to);
      },
    },
    sentTo: () => sent,
  };
}

async function buildTestServer(options: { mailer?: Mailer } = {}): Promise<TestServer> {
  const usersStore = openInMemoryStore<AdminUser>();
  const { hash, salt } = hashPassword(DEVELOPER_PASSWORD);
  const developerId = normaliseUsername(DEVELOPER_USERNAME);
  await usersStore.save({
    id: developerId,
    username: DEVELOPER_USERNAME,
    passwordHash: hash,
    passwordSalt: salt,
    name: 'Dev One',
    email: 'dev-one@example.com',
    role: 'developer',
    status: 'active',
    timezone: 'UTC',
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
    siteInviteStore: openInMemoryStore<SiteInvite>(),
    oauthProviders: [],
    baseUrl: 'http://admin.example.test',
    mailer: options.mailer,
  };

  const app = await buildServer(undefined, deps);
  const cookie = await loginCookie(app, DEVELOPER_USERNAME, DEVELOPER_PASSWORD);

  return { app, deps, cookie, siteId };
}

function extractCode(url: string): string {
  const match = /\/invite\/([^/]+)$/.exec(url);
  assert.ok(match, `expected a /invite/<code> url, got ${url}`);
  return match[1]!;
}

describe('site-invites routes', () => {
  it('POST /:siteId/invites with a mailer configured emails the invite and reports emailSent: true', async () => {
    const { mailer, sentTo } = fakeMailer();
    const { app, cookie, siteId } = await buildTestServer({ mailer });

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'client@example.com' },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.emailSent, true);
    assert.match(body.url, /^http:\/\/admin\.example\.test\/invite\//);
    assert.deepEqual(sentTo(), ['client@example.com']);

    await app.close();
  });

  it('POST /:siteId/invites with no mailer configured still succeeds, reports emailSent: false, and returns a usable link', async () => {
    const { app, cookie, siteId } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'client@example.com' },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.emailSent, false);
    assert.match(body.url, /^http:\/\/admin\.example\.test\/invite\//);

    await app.close();
  });

  it('POST /:siteId/invites rejects a missing email with 400', async () => {
    const { app, cookie, siteId } = await buildTestServer();

    const response = await app.inject({ method: 'POST', url: `/api/sites/${siteId}/invites`, headers: { cookie }, payload: {} });

    assert.equal(response.statusCode, 400);

    await app.close();
  });

  it('GET /:siteId/invites lists pending invites without ever exposing the raw code', async () => {
    const { app, cookie, siteId } = await buildTestServer();
    await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'client@example.com' },
    });

    const response = await app.inject({ method: 'GET', url: `/api/sites/${siteId}/invites`, headers: { cookie } });
    assert.equal(response.statusCode, 200);
    const { invites } = response.json();
    assert.equal(invites.length, 1);
    assert.equal(invites[0].email, 'client@example.com');
    assert.equal(invites[0].claimedAt, null);
    assert.equal(invites[0].code, undefined);
    assert.equal(invites[0].url, undefined);

    await app.close();
  });

  it('DELETE /:siteId/invites/:inviteId revokes a pending invite', async () => {
    const { app, cookie, siteId } = await buildTestServer();
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'client@example.com' },
    });
    const listBefore = await app.inject({ method: 'GET', url: `/api/sites/${siteId}/invites`, headers: { cookie } });
    const inviteId = listBefore.json().invites[0].id;
    assert.equal(createResponse.statusCode, 201);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${siteId}/invites/${inviteId}`,
      headers: { cookie },
    });
    assert.equal(deleteResponse.statusCode, 200);

    const listAfter = await app.inject({ method: 'GET', url: `/api/sites/${siteId}/invites`, headers: { cookie } });
    assert.equal(listAfter.json().invites.length, 0);

    await app.close();
  });

  it('a client (not developer) gets 403 creating an invite', async () => {
    const { app, deps, siteId } = await buildTestServer();
    const { hash, salt } = hashPassword('client password');
    const clientId = normaliseUsername('some-client');
    await deps.usersStore.save({
      id: clientId,
      username: 'some-client',
      passwordHash: hash,
      passwordSalt: salt,
      name: 'Some Client',
      email: 'some-client@example.com',
      role: 'client',
      status: 'active',
      timezone: 'UTC',
      createdAt: new Date().toISOString(),
    });
    await deps.siteAccessStore.save({ id: siteAccessId(clientId, siteId), userId: clientId, siteId, grantedAt: new Date().toISOString() });
    const clientCookie = await loginCookie(app, 'some-client', 'client password');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie: clientCookie },
      payload: { email: 'irrelevant@example.com' },
    });
    assert.equal(response.statusCode, 403);

    await app.close();
  });

  it('a developer creating an invite for a site they do not own gets the same 404 as a nonexistent site', async () => {
    const { app, deps, cookie } = await buildTestServer();
    const { hash, salt } = hashPassword('other dev password');
    const otherDevId = normaliseUsername('other-dev');
    await deps.usersStore.save({
      id: otherDevId,
      username: 'other-dev',
      passwordHash: hash,
      passwordSalt: salt,
      name: 'Other Dev',
      email: 'other-dev@example.com',
      role: 'developer',
      status: 'active',
      timezone: 'UTC',
      createdAt: new Date().toISOString(),
    });
    const otherSiteId = randomUUID();
    await deps.sitesStore.save({
      id: otherSiteId,
      url: 'http://127.0.0.1:2',
      token: 'unused',
      ownerId: otherDevId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${otherSiteId}/invites`,
      headers: { cookie },
      payload: { email: 'irrelevant@example.com' },
    });
    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('GET /api/invites/:code reports the target site and email but never who created it', async () => {
    const { app, cookie, siteId } = await buildTestServer();
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'client@example.com' },
    });
    const code = extractCode(createResponse.json().url);

    const response = await app.inject({ method: 'GET', url: `/api/invites/${code}` });
    assert.equal(response.statusCode, 200);
    // deepEqual on the full expected shape already proves createdBy
    // (or anything else) isn't present - a mismatched key set fails
    // deepEqual, not just a value comparison.
    assert.deepEqual(response.json(), { valid: true, siteUrl: 'http://127.0.0.1:1', email: 'client@example.com' });

    await app.close();
  });

  it('GET /api/invites/:code reports not-found for a bogus code', async () => {
    const { app } = await buildTestServer();

    const response = await app.inject({ method: 'GET', url: '/api/invites/not-a-real-code' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { valid: false, reason: 'not-found' });

    await app.close();
  });

  it('claiming with a weak password is rejected with 400 and makes no mutation', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'weak-password@example.com' },
    });
    const code = extractCode(createResponse.json().url);

    const claimResponse = await app.inject({
      method: 'POST',
      url: `/api/invites/${code}/claim`,
      payload: { name: 'Weak Password', password: 'all lowercase' },
    });
    assert.equal(claimResponse.statusCode, 400);
    assert.equal(claimResponse.json().message, PASSWORD_REQUIREMENTS_MESSAGE);

    const newUser = await deps.usersStore.find(normaliseUsername('weak-password@example.com'));
    assert.equal(newUser, undefined, 'no account should have been created');

    await app.close();
  });

  it('claiming while unauthenticated with a genuinely new email creates a client account, grants access, and logs them in', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'new-client@example.com' },
    });
    const code = extractCode(createResponse.json().url);

    const claimResponse = await app.inject({
      method: 'POST',
      url: `/api/invites/${code}/claim`,
      payload: { name: 'New Client', password: STRONG_PASSWORD },
    });
    assert.equal(claimResponse.statusCode, 200);
    assert.deepEqual(claimResponse.json(), { ok: true, siteId });

    const claimCookie = (() => {
      const header = claimResponse.headers['set-cookie'];
      const raw = Array.isArray(header) ? header[0] : header;
      assert.ok(raw, 'expected claiming to establish a session');
      return raw.split(';')[0] as string;
    })();

    const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: claimCookie } });
    assert.equal(meResponse.statusCode, 200);
    assert.equal(meResponse.json().email, 'new-client@example.com');
    assert.equal(meResponse.json().role, 'client');

    const newUser = await deps.usersStore.find(normaliseUsername('new-client@example.com'));
    assert.ok(newUser);
    assert.equal(newUser!.name, 'New Client');
    assert.equal(newUser!.timezone, 'UTC', 'no timezone was sent, so it defaults');

    const access = await deps.siteAccessStore.find(siteAccessId(newUser!.id, siteId));
    assert.ok(access, 'expected a SiteAccess grant to have been created');

    const invite = await deps.siteInviteStore.find(hashCodeForTest(code));
    assert.ok(invite!.claimedAt);
    assert.equal(invite!.claimedByUserId, newUser!.id);

    await app.close();
  });

  it('claiming with a supplied timezone (ClaimInvitePage.tsx captures the browser\'s own) uses it instead of the default', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'sydney-client@example.com' },
    });
    const code = extractCode(createResponse.json().url);

    const claimResponse = await app.inject({
      method: 'POST',
      url: `/api/invites/${code}/claim`,
      payload: { name: 'Sydney Client', password: STRONG_PASSWORD, timezone: 'Australia/Sydney' },
    });
    assert.equal(claimResponse.statusCode, 200);

    const newUser = await deps.usersStore.find(normaliseUsername('sydney-client@example.com'));
    assert.equal(newUser?.timezone, 'Australia/Sydney');

    await app.close();
  });

  it('claiming with an invalid timezone is rejected with 400 and no account is created', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'bad-zone-client@example.com' },
    });
    const code = extractCode(createResponse.json().url);

    const claimResponse = await app.inject({
      method: 'POST',
      url: `/api/invites/${code}/claim`,
      payload: { name: 'Bad Zone Client', password: STRONG_PASSWORD, timezone: 'Not/A_Real_Zone' },
    });
    assert.equal(claimResponse.statusCode, 400);

    const newUser = await deps.usersStore.find(normaliseUsername('bad-zone-client@example.com'));
    assert.equal(newUser, undefined, 'no account should have been created');

    await app.close();
  });

  it('claiming while already logged in grants the current account access with no body, regardless of email', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();
    const { hash, salt } = hashPassword('existing client password');
    const existingClientId = normaliseUsername('existing-client');
    await deps.usersStore.save({
      id: existingClientId,
      username: 'existing-client',
      passwordHash: hash,
      passwordSalt: salt,
      name: 'Existing Client',
      email: 'existing-client@example.com',
      role: 'client',
      status: 'active',
      timezone: 'UTC',
      createdAt: new Date().toISOString(),
    });
    const clientCookie = await loginCookie(app, 'existing-client', 'existing client password');

    // Invited under a *different* email than the logged-in client's own -
    // still grants the currently-authenticated account, per design.
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'someone-else@example.com' },
    });
    const code = extractCode(createResponse.json().url);

    const claimResponse = await app.inject({ method: 'POST', url: `/api/invites/${code}/claim`, headers: { cookie: clientCookie } });
    assert.equal(claimResponse.statusCode, 200);

    const access = await deps.siteAccessStore.find(siteAccessId(existingClientId, siteId));
    assert.ok(access, 'expected the already-logged-in account to have been granted access');

    await app.close();
  });

  it('claiming with an email that already belongs to an existing account is rejected, with no mutation', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();
    const { hash, salt } = hashPassword('taken password');
    await deps.usersStore.save({
      id: normaliseUsername('taken-client'),
      username: 'taken-client',
      passwordHash: hash,
      passwordSalt: salt,
      name: 'Taken Client',
      email: 'taken@example.com',
      role: 'client',
      status: 'active',
      timezone: 'UTC',
      createdAt: new Date().toISOString(),
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'taken@example.com' },
    });
    const code = extractCode(createResponse.json().url);

    const claimResponse = await app.inject({
      method: 'POST',
      url: `/api/invites/${code}/claim`,
      payload: { name: 'Impersonator', password: STRONG_PASSWORD },
    });
    assert.equal(claimResponse.statusCode, 409);

    const access = await deps.siteAccessStore.find(siteAccessId(normaliseUsername('taken-client'), siteId));
    assert.equal(access, undefined, 'must not have granted access to the existing account');

    const invite = await deps.siteInviteStore.find(hashCodeForTest(code));
    assert.equal(invite!.claimedAt, null, 'must not have marked the invite claimed');

    await app.close();
  });

  it('claiming the same invite twice fails the second time', async () => {
    const { app, cookie, siteId } = await buildTestServer();
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'twice@example.com' },
    });
    const code = extractCode(createResponse.json().url);

    const first = await app.inject({ method: 'POST', url: `/api/invites/${code}/claim`, payload: { name: 'Once', password: STRONG_PASSWORD } });
    assert.equal(first.statusCode, 200);

    const second = await app.inject({ method: 'POST', url: `/api/invites/${code}/claim`, payload: { name: 'Twice', password: STRONG_PASSWORD } });
    assert.equal(second.statusCode, 400);

    await app.close();
  });

  it('claiming an expired invite fails', async () => {
    const { app, deps, cookie, siteId } = await buildTestServer();
    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/sites/${siteId}/invites`,
      headers: { cookie },
      payload: { email: 'expired@example.com' },
    });
    const code = extractCode(createResponse.json().url);
    const invite = await deps.siteInviteStore.find(hashCodeForTest(code));
    await deps.siteInviteStore.save({ ...invite!, expiresAt: '2020-01-01T00:00:00.000Z' });

    const claimResponse = await app.inject({
      method: 'POST',
      url: `/api/invites/${code}/claim`,
      payload: { name: 'Too Late', password: STRONG_PASSWORD },
    });
    assert.equal(claimResponse.statusCode, 400);

    const infoResponse = await app.inject({ method: 'GET', url: `/api/invites/${code}` });
    assert.deepEqual(infoResponse.json(), { valid: false, reason: 'expired' });

    await app.close();
  });
});

// Test-only mirror of hashInviteCode - kept local rather than
// imported, so these assertions independently confirm the id really
// is derived the way sites/site-invite.ts documents, not just
// whatever that module happens to compute.
function hashCodeForTest(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
