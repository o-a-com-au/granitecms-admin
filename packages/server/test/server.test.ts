import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer, type ServerDeps } from '../src/server.ts';
import type { AdminConfig } from '../src/config.ts';
import { loadConfig } from '../src/config.ts';
import { openInMemoryUserStore } from '../src/store/user-store.ts';
import { openInMemorySiteStore } from '../src/store/site-store.ts';
import { openInMemorySiteAccessStore } from '../src/store/site-access-store.ts';
import { openInMemorySiteInviteStore } from '../src/store/site-invite-store.ts';
import { openInMemoryStore } from '../src/store/in-memory-store.ts';
import { hashPassword } from '../src/auth/password.ts';
import { normaliseUsername } from '../src/auth/users.ts';
import type { SessionRecord } from '../src/auth/session-store-adapter.ts';

describe('server', () => {
  it('A2: GET /api/health returns ok', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });

    await app.close();
  });
});

describe('server - production static/SPA serving', () => {
  let webDistDir: string;
  let config: AdminConfig;

  beforeEach(async () => {
    webDistDir = await mkdtemp(join(tmpdir(), 'admin-web-dist-'));
    await writeFile(join(webDistDir, 'index.html'), '<html><body>admin shell</body></html>');
    await writeFile(join(webDistDir, 'app.js'), 'console.log("asset");');
    config = {
      port: 0,
      webDistDir,
      baseUrl: 'http://localhost:0',
      googleOAuth: undefined,
      githubOAuth: undefined,
      smtp: undefined,
      databaseUrl: 'postgres://admin:admin@localhost:5432/cms_admin',
      redisUrl: 'redis://localhost:6379',
      trustProxy: false,
    };
  });

  afterEach(async () => {
    await rm(webDistDir, { recursive: true, force: true });
  });

  it('serves a real static asset from the built web dist', async () => {
    const app = await buildServer(config);
    const response = await app.inject({ method: 'GET', url: '/app.js' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, 'console.log("asset");');

    await app.close();
  });

  it('falls back to index.html for an unknown non-API path (SPA client-side routing)', async () => {
    const app = await buildServer(config);
    const response = await app.inject({ method: 'GET', url: '/sites/some-unknown-page' });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /admin shell/);

    await app.close();
  });

  it('an unknown /api path still returns a plain JSON 404, never swallowed by the SPA fallback', async () => {
    const app = await buildServer(config);
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: 'not found' });

    await app.close();
  });
});

describe('server - trustProxy', () => {
  const TEST_USERNAME = 'editor';
  const TEST_PASSWORD = 'correct horse battery staple';

  async function buildTestServer(trustProxy: string | boolean): Promise<Awaited<ReturnType<typeof buildServer>>> {
    const usersStore = openInMemoryUserStore();
    const { hash, salt } = hashPassword(TEST_PASSWORD);
    await usersStore.save({
      id: normaliseUsername(TEST_USERNAME),
      username: TEST_USERNAME,
      passwordHash: hash,
      passwordSalt: salt,
      firstName: 'Jane',
      lastName: 'Editor',
      email: 'jane@example.com',
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

    return buildServer({ ...loadConfig(), trustProxy }, deps);
  }

  function setCookieHeader(header: string | string[] | undefined): string {
    const value = Array.isArray(header) ? header[0] : header;
    assert.ok(value, 'expected a set-cookie header');
    return value;
  }

  // secure: 'auto' (server.ts) decides the cookie's Secure attribute
  // from request.protocol - which only reflects X-Forwarded-Proto once
  // Fastify is told to trust the proxy that set it. Without that,
  // trusting an attacker-controlled header would let anyone claim
  // "https" from plain http and get a cookie marked Secure over a
  // connection that isn't.
  it('without trustProxy, X-Forwarded-Proto: https is ignored - the cookie is not marked Secure', async () => {
    const app = await buildTestServer(false);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-proto': 'https' },
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });

    assert.equal(response.statusCode, 200);
    assert.doesNotMatch(setCookieHeader(response.headers['set-cookie']), /Secure/i);

    await app.close();
  });

  it('with trustProxy enabled, X-Forwarded-Proto: https is honoured - the cookie is marked Secure', async () => {
    const app = await buildTestServer(true);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-proto': 'https' },
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });

    assert.equal(response.statusCode, 200);
    assert.match(setCookieHeader(response.headers['set-cookie']), /Secure/i);

    await app.close();
  });
});
