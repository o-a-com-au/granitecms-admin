import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { buildServer, type ServerDeps } from '../../src/server.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { normaliseUsername, type AdminUser } from '../../src/auth/users.ts';
import { hashPassword } from '../../src/auth/password.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';
import type { Site } from '../../src/sites/site.ts';
import type { SiteAccess } from '../../src/sites/site-access.ts';
import type { OAuthProvider } from '../../src/auth/oauth-provider.ts';

let fakeTokenServer: Server | undefined;

afterEach(async () => {
  if (fakeTokenServer) {
    await new Promise<void>((resolve) => fakeTokenServer!.close(() => resolve()));
    fakeTokenServer = undefined;
  }
});

// A real local HTTP server standing in for a provider's token
// endpoint - exchangeCodeForToken (routes/oauth.ts) genuinely POSTs
// to this, so these tests exercise the real fetch call rather than
// stubbing it out. Counts calls so the "state rejected before any
// token exchange" test can assert the exchange never happened.
async function startFakeTokenEndpoint(tokenResponse: unknown): Promise<{ url: string; callCount: () => number }> {
  let calls = 0;
  const handler = (_req: IncomingMessage, res: ServerResponse) => {
    calls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(tokenResponse));
  };
  fakeTokenServer = createServer(handler);
  await new Promise<void>((resolve) => fakeTokenServer!.listen(0, '127.0.0.1', resolve));
  const address = fakeTokenServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a real listening address');
  }
  return { url: `http://127.0.0.1:${address.port}`, callCount: () => calls };
}

// resolveIdentity is a plain injected function - real code, not a
// mock framework stand-in - so these tests exercise routes/oauth.ts's
// actual redirect/state/token-exchange/find-or-create flow without
// depending on real Google/GitHub credentials or google-auth-library's
// own ID-token verification (that's oauth-google.test.ts's concern,
// not this file's).
function fakeProvider(tokenUrl: string, identity: { email: string; name: string }): OAuthProvider {
  return {
    id: 'google',
    authorizeUrl: 'https://fake-provider.example.test/authorize',
    tokenUrl,
    clientId: 'fake-client-id',
    clientSecret: 'fake-client-secret',
    scope: 'openid email profile',
    resolveIdentity: async () => identity,
  };
}

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  assert.ok(header, 'expected a set-cookie header');
  return header.split(';')[0] as string;
}

async function buildTestServer(oauthProviders: OAuthProvider[]): Promise<{ app: Awaited<ReturnType<typeof buildServer>>; deps: ServerDeps }> {
  const deps: ServerDeps = {
    usersStore: openInMemoryStore<AdminUser>(),
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore: openInMemoryStore<Site>(),
    siteAccessStore: openInMemoryStore<SiteAccess>(),
    oauthProviders,
    baseUrl: 'http://localhost:0',
  };
  const app = await buildServer(undefined, deps);
  return { app, deps };
}

describe('oauth routes', () => {
  it('GET /api/auth/providers reports only the providers actually configured', async () => {
    const { url } = await startFakeTokenEndpoint({});
    const { app } = await buildTestServer([fakeProvider(url, { email: 'irrelevant@example.com', name: 'Irrelevant' })]);

    const response = await app.inject({ method: 'GET', url: '/api/auth/providers' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { providers: ['google'] });

    await app.close();
  });

  it('GET /api/auth/providers reports none when no provider is configured', async () => {
    const { app } = await buildTestServer([]);

    const response = await app.inject({ method: 'GET', url: '/api/auth/providers' });
    assert.deepEqual(response.json(), { providers: [] });

    await app.close();
  });

  it('a provider with no configured client id/secret registers no route at all - a plain 404, not an error', async () => {
    const { app } = await buildTestServer([]);

    const response = await app.inject({ method: 'GET', url: '/api/auth/google' });
    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('GET /api/auth/google redirects to the provider with a state parameter, and stores it in the session', async () => {
    const { url } = await startFakeTokenEndpoint({});
    const { app } = await buildTestServer([fakeProvider(url, { email: 'irrelevant@example.com', name: 'Irrelevant' })]);

    const response = await app.inject({ method: 'GET', url: '/api/auth/google' });
    assert.equal(response.statusCode, 302);
    const location = new URL(response.headers.location as string);
    assert.equal(location.origin + location.pathname, 'https://fake-provider.example.test/authorize');
    assert.ok(location.searchParams.get('state'), 'expected a state parameter on the redirect');
    assert.ok(response.headers['set-cookie'], 'expected a session cookie to be set');

    await app.close();
  });

  it('callback with a valid code and state signs into an existing account matched by verified email, without creating a new one', async () => {
    const { url } = await startFakeTokenEndpoint({ access_token: 'fake-token' });
    const { hash, salt } = hashPassword('existing password');
    const existingUser: AdminUser = {
      id: normaliseUsername('existing-dev'),
      username: 'existing-dev',
      passwordHash: hash,
      passwordSalt: salt,
      name: 'Existing Dev',
      // Deliberately different case/whitespace than the identity the
      // fake provider resolves to below - proves the match is
      // case/whitespace-normalised, not a raw string comparison.
      email: '  Existing@Example.com ',
      role: 'developer',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { app, deps } = await buildTestServer([
      fakeProvider(url, { email: 'existing@example.com', name: 'Should Not Overwrite' }),
    ]);
    await deps.usersStore.save(existingUser);

    const startResponse = await app.inject({ method: 'GET', url: '/api/auth/google' });
    const cookie = extractCookie(startResponse.headers['set-cookie']);
    const state = new URL(startResponse.headers.location as string).searchParams.get('state')!;

    const callbackResponse = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=fake-code&state=${state}`,
      headers: { cookie },
    });
    assert.equal(callbackResponse.statusCode, 302);
    assert.equal(callbackResponse.headers.location, '/');

    const callbackCookie = extractCookie(callbackResponse.headers['set-cookie']) ?? cookie;
    const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: callbackCookie } });
    assert.equal(meResponse.statusCode, 200);
    assert.equal(meResponse.json().id, existingUser.id);
    // The existing account's own name is untouched - OAuth sign-in
    // matches an account, it never overwrites one.
    assert.equal(meResponse.json().name, 'Existing Dev');

    const allUsers = await deps.usersStore.list();
    assert.equal(allUsers.length, 1, 'must not have created a second account');

    await app.close();
  });

  it('callback with a valid code and no matching email creates a new role: developer account', async () => {
    const { url } = await startFakeTokenEndpoint({ access_token: 'fake-token' });
    const { app, deps } = await buildTestServer([fakeProvider(url, { email: 'brand-new@example.com', name: 'Brand New' })]);

    const startResponse = await app.inject({ method: 'GET', url: '/api/auth/google' });
    const cookie = extractCookie(startResponse.headers['set-cookie']);
    const state = new URL(startResponse.headers.location as string).searchParams.get('state')!;

    const callbackResponse = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=fake-code&state=${state}`,
      headers: { cookie },
    });
    assert.equal(callbackResponse.statusCode, 302);

    const allUsers = await deps.usersStore.list();
    assert.equal(allUsers.length, 1);
    assert.equal(allUsers[0]!.email, 'brand-new@example.com');
    assert.equal(allUsers[0]!.role, 'developer');
    assert.equal(allUsers[0]!.status, 'active');

    await app.close();
  });

  it('a missing state on the callback is rejected with 400 before any token exchange is attempted', async () => {
    const { url, callCount } = await startFakeTokenEndpoint({ access_token: 'fake-token' });
    const { app } = await buildTestServer([fakeProvider(url, { email: 'irrelevant@example.com', name: 'Irrelevant' })]);

    const startResponse = await app.inject({ method: 'GET', url: '/api/auth/google' });
    const cookie = extractCookie(startResponse.headers['set-cookie']);

    const callbackResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=fake-code',
      headers: { cookie },
    });
    assert.equal(callbackResponse.statusCode, 400);
    assert.equal(callCount(), 0, 'the token endpoint must never be called when state is missing');

    await app.close();
  });

  it('a mismatched state on the callback is rejected with 400 before any token exchange is attempted', async () => {
    const { url, callCount } = await startFakeTokenEndpoint({ access_token: 'fake-token' });
    const { app } = await buildTestServer([fakeProvider(url, { email: 'irrelevant@example.com', name: 'Irrelevant' })]);

    const startResponse = await app.inject({ method: 'GET', url: '/api/auth/google' });
    const cookie = extractCookie(startResponse.headers['set-cookie']);

    const callbackResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=fake-code&state=not-the-real-state',
      headers: { cookie },
    });
    assert.equal(callbackResponse.statusCode, 400);
    assert.equal(callCount(), 0, 'the token endpoint must never be called when state does not match');

    await app.close();
  });
});
