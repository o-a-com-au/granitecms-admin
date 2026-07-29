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

const SAMPLE_ENTRY = {
  path: 'pages/about.json',
  title: 'About',
  type: 'page',
  published: true,
  hasDraft: false,
  url: '/about',
};

// A second fake-site starter, kept separate from startFakeSite above
// rather than complicating it further - this one serves real content
// entries and echoes the received query string, for D1/D2's own
// tests, without risking the existing C1/C3/C4 tests that already
// depend on startFakeSite's exact behaviour.
async function startFakeContentSite(acceptedToken: string): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url?.startsWith('/v1/content')) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${acceptedToken}`) {
        sendJson(res, 401, { error: 'invalid-token' });
        return;
      }
      sendJson(res, 200, [SAMPLE_ENTRY, { ...SAMPLE_ENTRY, path: 'pages/contact.json', title: 'Contact' }]);
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

async function registerSite(
  app: Awaited<ReturnType<typeof buildServer>>,
  cookie: string,
  url: string,
  token: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/sites',
    headers: { cookie },
    payload: { url, token },
  });
  return response.json().id as string;
}

// A third fake-site starter: a real (if minimal) stand-in for the
// agent's own optimistic-concurrency semantics on
// GET/PUT /v1/drafts/pages/about.json and GET /v1/content/pages/about.json,
// for E1-E6's own tests - not a mock, a genuinely stateful in-memory
// draft/live store with real ETag comparison, including an optional
// artificial PUT delay so the E6 concurrency test can force two
// requests to genuinely overlap rather than pass by luck.
interface FakeEditorSiteOptions {
  acceptedToken: string;
  draftContent?: string;
  liveContent?: string;
  putDelayMs?: number;
}

async function startFakeEditorSite(options: FakeEditorSiteOptions): Promise<string> {
  let etagCounter = 0;
  function nextEtag(): string {
    etagCounter += 1;
    return `"etag-${etagCounter}"`;
  }

  let draftContent = options.draftContent ?? null;
  let draftEtag = draftContent !== null ? nextEtag() : null;
  const liveContent = options.liveContent ?? null;
  const liveEtag = liveContent !== null ? nextEtag() : null;

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${options.acceptedToken}`) {
      sendJson(res, 401, { error: 'invalid-token' });
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/drafts/pages/about.json') {
      if (draftContent === null) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json', etag: draftEtag as string });
      res.end(draftContent);
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/content/pages/about.json') {
      if (liveContent === null) {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json', etag: liveEtag as string });
      res.end(liveContent);
      return;
    }

    if (req.method === 'PUT' && req.url === '/v1/drafts/pages/about.json') {
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      req.on('end', () => {
        const write = () => {
          const ifMatch = req.headers['if-match'];
          const currentEtag = draftEtag ?? liveEtag;
          if (ifMatch !== currentEtag) {
            sendJson(res, 409, { statusCode: 409, error: 'Conflict', message: 'stale' });
            return;
          }
          draftContent = raw;
          draftEtag = nextEtag();
          res.writeHead(200, { 'content-type': 'application/json', etag: draftEtag });
          res.end(JSON.stringify({ ok: true }));
        };
        if (options.putDelayMs) {
          setTimeout(write, options.putDelayMs);
        } else {
          write();
        }
      });
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

interface FakePreviewSiteOptions {
  acceptedToken: string;
  // A page with a draft renders differently to one without, so tests
  // can tell from the response body alone which path the fake site
  // actually took - not asserted against the site's own draft/live
  // logic (that's the agent repo's job), only that the admin's proxy
  // forwards whatever comes back.
  hasDraft: boolean;
}

async function startFakePreviewSite(options: FakePreviewSiteOptions): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${options.acceptedToken}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid-token' }));
      return;
    }

    if (req.url === '/v1/preview/about') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(options.hasDraft ? '<html><body>Draft About</body></html>' : '<html><body>Live About</body></html>');
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ statusCode: 404, error: 'Not Found', message: `No page at "${req.url}"` }));
  };

  fakeSite = createServer(handler);
  await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
  const address = fakeSite.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a real listening address');
  }
  return `http://127.0.0.1:${address.port}`;
}

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

    const content = await app.inject({ method: 'GET', url: '/api/sites/anything/content' });
    assert.equal(content.statusCode, 401);

    const preview = await app.inject({ method: 'GET', url: '/api/sites/anything/preview/about' });
    assert.equal(preview.statusCode, 401);

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

  it('D1: lists real content entries from a real fake site', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeContentSite('content-token');
    const id = await registerSite(app, cookie, siteUrl, 'content-token');

    const response = await app.inject({ method: 'GET', url: `/api/sites/${id}/content`, headers: { cookie } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [
      SAMPLE_ENTRY,
      { ...SAMPLE_ENTRY, path: 'pages/contact.json', title: 'Contact' },
    ]);

    await app.close();
  });

  it('D2: forwards type, prefix, and draftStatus query params to the site', async () => {
    const { app, cookie } = await buildTestServer();
    let receivedUrl = '';
    fakeSite = createServer((req, res) => {
      receivedUrl = req.url ?? '';
      sendJson(res, 200, []);
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'any-token');

    await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content?type=page&prefix=blog%2F&draftStatus=has-draft`,
      headers: { cookie },
    });

    const params = new URLSearchParams(receivedUrl.split('?')[1]);
    assert.equal(params.get('type'), 'page');
    assert.equal(params.get('prefix'), 'blog/');
    assert.equal(params.get('draftStatus'), 'has-draft');

    await app.close();
  });

  it('GET /api/sites/:id/content rejects an invalid draftStatus with 400', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeContentSite('content-token');
    const id = await registerSite(app, cookie, siteUrl, 'content-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content?draftStatus=not-a-real-value`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 400);

    await app.close();
  });

  it('GET /api/sites/:id/content returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({ method: 'GET', url: '/api/sites/does-not-exist/content', headers: { cookie } });
    assert.equal(response.statusCode, 404);
  });

  it('D3 groundwork: an unreachable site produces a 502 with reason "unreachable"', async () => {
    const { app, cookie } = await buildTestServer();
    const id = await registerSite(app, cookie, 'http://127.0.0.1:1', 'any-token');

    const response = await app.inject({ method: 'GET', url: `/api/sites/${id}/content`, headers: { cookie } });

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().reason, 'unreachable');

    await app.close();
  });

  it('D3 groundwork: a rejected token produces a 502 with reason "unauthorized"', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeContentSite('the-real-token');
    const id = await registerSite(app, cookie, siteUrl, 'a-wrong-token');

    const response = await app.inject({ method: 'GET', url: `/api/sites/${id}/content`, headers: { cookie } });

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().reason, 'unauthorized');

    await app.close();
  });

  it('E1: GET /api/sites/:id/content/* returns the draft, with an etag and the source header', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({
      acceptedToken: 'the-token',
      draftContent: '{"title":"Draft"}',
      liveContent: '{"title":"Live"}',
    });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content/pages/about.json`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-content-source'], 'draft');
    assert.equal(response.headers.etag, '"etag-1"');
    assert.equal(response.body, '{"title":"Draft"}');

    await app.close();
  });

  it('E1: falls back to live when there is no draft', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({ acceptedToken: 'the-token', liveContent: '{"title":"Live"}' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content/pages/about.json`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-content-source'], 'live');
    assert.equal(response.body, '{"title":"Live"}');

    await app.close();
  });

  it('GET /api/sites/:id/content/* returns 404 when neither draft nor live exists', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({ acceptedToken: 'the-token' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content/pages/nope.json`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('E2, E3: PUT /api/sites/:id/drafts/* saves with If-Match and returns the new ETag', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({ acceptedToken: 'the-token', liveContent: '{"title":"Live"}' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const readResponse = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content/pages/about.json`,
      headers: { cookie },
    });
    const etag = readResponse.headers.etag as string;

    const saveResponse = await app.inject({
      method: 'PUT',
      url: `/api/sites/${id}/drafts/pages/about.json`,
      headers: { cookie, 'if-match': etag },
      payload: { title: 'Edited' },
    });

    assert.equal(saveResponse.statusCode, 200);
    assert.deepEqual(saveResponse.json(), { ok: true });
    assert.notEqual(saveResponse.headers.etag, etag);

    await app.close();
  });

  it('PUT /api/sites/:id/drafts/* requires an If-Match header (428)', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({ acceptedToken: 'the-token', liveContent: '{"title":"Live"}' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'PUT',
      url: `/api/sites/${id}/drafts/pages/about.json`,
      headers: { cookie },
      payload: { title: 'Edited' },
    });

    assert.equal(response.statusCode, 428);

    await app.close();
  });

  it('E4: a stale If-Match is forwarded as a real 409, not a generic error', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({ acceptedToken: 'the-token', liveContent: '{"title":"Live"}' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'PUT',
      url: `/api/sites/${id}/drafts/pages/about.json`,
      headers: { cookie, 'if-match': '"a-stale-etag"' },
      payload: { title: 'Edited' },
    });

    assert.equal(response.statusCode, 409);

    await app.close();
  });

  it('E6: two concurrent saves racing the same stale If-Match - exactly one succeeds, the other gets 409', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({
      acceptedToken: 'the-token',
      liveContent: '{"title":"Live"}',
      putDelayMs: 100,
    });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const readResponse = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content/pages/about.json`,
      headers: { cookie },
    });
    const etag = readResponse.headers.etag as string;

    // Neither awaited before the other starts - the fake site's own
    // artificial delay guarantees genuine overlap, not occasional luck.
    const [first, second] = await Promise.all([
      app.inject({
        method: 'PUT',
        url: `/api/sites/${id}/drafts/pages/about.json`,
        headers: { cookie, 'if-match': etag },
        payload: { title: 'From tab A' },
      }),
      app.inject({
        method: 'PUT',
        url: `/api/sites/${id}/drafts/pages/about.json`,
        headers: { cookie, 'if-match': etag },
        payload: { title: 'From tab B' },
      }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    assert.deepEqual(statuses, [200, 409], `expected exactly one 200 and one 409, got ${statuses.join(', ')}`);

    await app.close();
  });

  it('F1, F3: GET /api/sites/:id/preview/* forwards the real rendered draft HTML, status and content-type included', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakePreviewSite({ acceptedToken: 'the-token', hasDraft: true });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/preview/about`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(response.body, '<html><body>Draft About</body></html>');

    await app.close();
  });

  it('F4: a page with no draft still previews correctly, forwarding the live-fallback HTML', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakePreviewSite({ acceptedToken: 'the-token', hasDraft: false });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/preview/about`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, '<html><body>Live About</body></html>');

    await app.close();
  });

  it('GET /api/sites/:id/preview/* forwards the site\'s own 404 JSON verbatim when neither draft nor live exists', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakePreviewSite({ acceptedToken: 'the-token', hasDraft: false });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/preview/never-existed`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.headers['content-type'], 'application/json');
    const body = response.json() as { message: string };
    assert.equal(body.message, 'No page at "/v1/preview/never-existed"');

    await app.close();
  });

  it('GET /api/sites/:id/preview/* returns 404 for an unknown site id', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/does-not-exist/preview/about',
      headers: { cookie },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('GET /api/sites/:id/preview/* returns 502 for an unreachable site', async () => {
    const { app, cookie } = await buildTestServer();
    const id = await registerSite(app, cookie, 'http://127.0.0.1:1', 'any-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/preview/about`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().reason, 'unreachable');

    await app.close();
  });

  it('GET /api/sites/:id/preview/* returns 502 with reason "unauthorized" for a rejected token', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakePreviewSite({ acceptedToken: 'the-real-token', hasDraft: false });
    const id = await registerSite(app, cookie, siteUrl, 'the-wrong-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/preview/about`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().reason, 'unauthorized');

    await app.close();
  });
});
