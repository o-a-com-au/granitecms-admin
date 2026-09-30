import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { buildServer, type ServerDeps } from '../../src/server.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { openInMemoryUserStore, type UserStore } from '../../src/store/user-store.ts';
import { openInMemorySiteStore, type SiteStore } from '../../src/store/site-store.ts';
import { openInMemorySiteAccessStore } from '../../src/store/site-access-store.ts';
import { openInMemorySiteInviteStore } from '../../src/store/site-invite-store.ts';
import { openInMemoryApiKeyStore } from '../../src/store/api-key-store.ts';
import { hashPassword } from '../../src/auth/password.ts';
import type { AdminUserPlan } from '../../src/auth/users.ts';
import type { SessionRecord } from '../../src/auth/session-store-adapter.ts';

const PASSWORD = 'correct horse battery staple';

let fakeSite: Server | undefined;
afterEach(async () => {
  if (fakeSite) {
    await new Promise<void>((resolve) => fakeSite!.close(() => resolve()));
    fakeSite = undefined;
  }
});

// A site that answers capabilities, lists no content, and records the
// body of any publish it's sent.
async function startFakeSite(): Promise<{ url: string; published: Array<Record<string, unknown>> }> {
  const published: Array<Record<string, unknown>> = [];
  fakeSite = createServer((req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/v1/publish' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        published.push(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>);
        send(200, { ok: true });
      });
      return;
    }
    if (req.url?.startsWith('/v1/content')) {
      send(200, []);
      return;
    }
    send(200, { agentVersion: '0.8.0', contentSchemaVersion: 7, sqliteDriver: 'node:sqlite' });
  });
  await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
  const { port } = fakeSite.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, published };
}

async function addDeveloper(usersStore: UserStore, id: string, plan: AdminUserPlan | undefined): Promise<void> {
  const { hash, salt } = hashPassword(PASSWORD);
  await usersStore.save({
    id,
    username: id,
    passwordHash: hash,
    passwordSalt: salt,
    firstName: 'Jane',
    lastName: 'Editor',
    email: `${id}@example.com`,
    role: 'developer',
    status: 'active',
    timezone: 'UTC',
    ...(plan ? { plan } : {}),
    createdAt: new Date().toISOString(),
  });
}

async function setup({ plan = 'pro' as AdminUserPlan | undefined } = {}) {
  const usersStore = openInMemoryUserStore();
  const sitesStore: SiteStore = openInMemorySiteStore();
  await addDeveloper(usersStore, 'jane', plan);
  const site = await startFakeSite();
  const now = new Date().toISOString();
  await sitesStore.save({ id: 'site-a', url: site.url, token: 'site-token', ownerId: 'jane', createdAt: now, updatedAt: now });
  await sitesStore.save({ id: 'site-b', url: site.url, token: 'site-token', ownerId: 'jane', createdAt: now, updatedAt: now });

  const deps: ServerDeps = {
    usersStore,
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore,
    siteAccessStore: openInMemorySiteAccessStore(),
    siteInviteStore: openInMemorySiteInviteStore(),
    apiKeyStore: openInMemoryApiKeyStore(),
    oauthProviders: [],
    baseUrl: '',
    mailer: undefined,
  };
  const app = await buildServer(undefined, deps);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'jane', password: PASSWORD } });
  const setCookie = login.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0] as string;

  async function createKey(permission: string, siteIds = ['site-a']): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/api-keys',
      headers: { cookie },
      payload: { name: 'Claude', siteIds, permission },
    });
    assert.equal(response.statusCode, 201, response.body);
    return (response.json() as { key: string }).key;
  }

  return { app, cookie, usersStore, site, createKey };
}

describe('API keys', () => {
  it('a Pro developer creates a key, shown once; the list shows its name and prefix, never the key', async () => {
    const { app, cookie, createKey } = await setup();
    const key = await createKey('read');
    assert.match(key, /^gck_/);

    const list = await app.inject({ method: 'GET', url: '/api/api-keys', headers: { cookie } });
    const body = list.json() as { keys: Array<Record<string, unknown>>; eligibleSites: Array<{ id: string }> };
    assert.equal(body.keys.length, 1);
    assert.equal(body.keys[0]?.name, 'Claude');
    assert.equal(body.keys[0]?.prefix, key.slice(0, 10));
    assert.ok(!JSON.stringify(body).includes(key), 'the key itself is never listed');
    assert.deepEqual(body.eligibleSites.map((site) => site.id).sort(), ['site-a', 'site-b']);
    await app.close();
  });

  it('without the Pro plan there are no eligible sites and no key can be made', async () => {
    const { app, cookie } = await setup({ plan: 'free' });
    const list = await app.inject({ method: 'GET', url: '/api/api-keys', headers: { cookie } });
    assert.deepEqual((list.json() as { eligibleSites: unknown[] }).eligibleSites, []);
    const create = await app.inject({
      method: 'POST',
      url: '/api/api-keys',
      headers: { cookie },
      payload: { name: 'Claude', siteIds: ['site-a'], permission: 'read' },
    });
    assert.equal(create.statusCode, 403);
    assert.equal((create.json() as { reason: string }).reason, 'plan-required');
    await app.close();
  });

  it('a key acts as its owner, only on its own sites', async () => {
    const { app, createKey } = await setup();
    const key = await createKey('read');
    const auth = { authorization: `Bearer ${key}` };

    const sites = await app.inject({ method: 'GET', url: '/api/sites', headers: auth });
    assert.equal(sites.statusCode, 200, sites.body);
    assert.deepEqual((sites.json() as Array<{ id: string }>).map((site) => site.id), ['site-a']);

    assert.equal((await app.inject({ method: 'GET', url: '/api/sites/site-a/content', headers: auth })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/sites/site-b/content', headers: auth })).statusCode, 404);
    await app.close();
  });

  it('a key only reaches what its permission allows, and never account, team, key or destructive routes', async () => {
    const { app, createKey } = await setup();
    const readKey = { authorization: `Bearer ${await createKey('read')}` };
    const publishKey = { authorization: `Bearer ${await createKey('publish')}` };

    const saveDraft = await app.inject({
      method: 'PUT',
      url: '/api/sites/site-a/drafts/pages/about.json',
      headers: { ...readKey, 'if-match': '*' },
      payload: {},
    });
    assert.equal(saveDraft.statusCode, 403);
    assert.equal((saveDraft.json() as { reason: string }).reason, 'insufficient-permission');

    for (const [method, url] of [
      ['GET', '/api/auth/me'],
      ['GET', '/api/api-keys'],
      ['POST', '/api/sites/site-a/move'],
      ['DELETE', '/api/sites/site-a/content/pages/about.json'],
      ['DELETE', '/api/sites/site-a'],
      ['POST', '/api/sites/site-a/revert'],
    ] as const) {
      const response = await app.inject({ method, url, headers: publishKey, payload: {} });
      assert.equal(response.statusCode, 403, `${method} ${url}`);
      assert.equal((response.json() as { reason: string }).reason, 'not-available-to-api-keys', `${method} ${url}`);
    }
    await app.close();
  });

  it('what a key publishes is credited to its owner, marked as an AI agent', async () => {
    const { app, site, createKey } = await setup();
    const key = await createKey('publish');
    const response = await app.inject({
      method: 'POST',
      url: '/api/sites/site-a/publish',
      headers: { authorization: `Bearer ${key}` },
      payload: { path: 'pages/about.json', message: 'Publish About' },
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(site.published[0]?.author, { name: 'Jane Editor (via AI agent)', email: 'jane@example.com' });
    await app.close();
  });

  it('a key stops working when revoked, or when the site owner leaves the Pro plan; a made-up key never works', async () => {
    const { app, cookie, usersStore, createKey } = await setup();
    const key = await createKey('read');
    const auth = { authorization: `Bearer ${key}` };
    assert.equal((await app.inject({ method: 'GET', url: '/api/sites/site-a/content', headers: auth })).statusCode, 200);

    const jane = (await usersStore.find('jane'))!;
    await usersStore.save({ ...jane, plan: 'free' });
    const lapsed = await app.inject({ method: 'GET', url: '/api/sites/site-a/content', headers: auth });
    assert.equal(lapsed.statusCode, 403);
    assert.equal((lapsed.json() as { reason: string }).reason, 'plan-required');
    await usersStore.save({ ...jane, plan: 'pro' });

    const { keys } = (await app.inject({ method: 'GET', url: '/api/api-keys', headers: { cookie } })).json() as { keys: Array<{ id: string }> };
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/api-keys/${keys[0]!.id}`, headers: { cookie } })).statusCode, 204);
    assert.equal((await app.inject({ method: 'GET', url: '/api/sites/site-a/content', headers: auth })).statusCode, 401);

    const madeUp = await app.inject({ method: 'GET', url: '/api/sites', headers: { authorization: 'Bearer gck_not-a-real-key' } });
    assert.equal(madeUp.statusCode, 401);
    await app.close();
  });

  it('a new key needs a name, a permission, and only sites this person can give it', async () => {
    const { app, cookie } = await setup();
    const post = (payload: unknown) => app.inject({ method: 'POST', url: '/api/api-keys', headers: { cookie }, payload: payload as object });
    assert.equal((await post({ name: '', siteIds: ['site-a'], permission: 'read' })).statusCode, 400);
    assert.equal((await post({ name: 'Claude', siteIds: ['site-a'], permission: 'admin' })).statusCode, 400);
    assert.equal((await post({ name: 'Claude', siteIds: [], permission: 'read' })).statusCode, 400);
    assert.equal((await post({ name: 'Claude', siteIds: ['someone-elses-site'], permission: 'read' })).statusCode, 400);
    await app.close();
  });
});
