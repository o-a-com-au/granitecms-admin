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
const TEST_NAME = 'Jane Editor';
const TEST_EMAIL = 'jane@example.com';

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
  name: 'Home Page',
  title: 'About',
  type: 'page',
  published: true,
  hasDraft: false,
  url: '/about',
  changedAt: '2026-08-05T10:00:00.000Z',
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
      sendJson(res, 200, [
        SAMPLE_ENTRY,
        { ...SAMPLE_ENTRY, path: 'pages/contact.json', name: 'Contact', title: 'Contact' },
      ]);
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
  // G1: lets a test inspect exactly what the site received for a
  // publish call (e.g. the author identity), without widening this
  // helper's return type for every existing caller.
  onPublishBody?: (raw: string) => void;
}

async function startFakeEditorSite(options: FakeEditorSiteOptions): Promise<string> {
  let etagCounter = 0;
  function nextEtag(): string {
    etagCounter += 1;
    return `"etag-${etagCounter}"`;
  }

  let draftContent = options.draftContent ?? null;
  let draftEtag = draftContent !== null ? nextEtag() : null;
  let liveContent = options.liveContent ?? null;
  let liveEtag = liveContent !== null ? nextEtag() : null;

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

    // G3: idempotent, matching the real agent - 204 whether or not a
    // draft currently exists.
    if (req.method === 'DELETE' && req.url === '/v1/drafts/pages/about.json') {
      draftContent = null;
      draftEtag = null;
      res.writeHead(204);
      res.end();
      return;
    }

    // G1, G2: a real (if minimal) publish - moves draft content to
    // live, matching the real agent's own draft-to-live move, so a
    // subsequent GET /v1/content/... genuinely reflects it.
    if (req.method === 'POST' && req.url === '/v1/publish') {
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      req.on('end', () => {
        options.onPublishBody?.(raw);
        const body = JSON.parse(raw) as { paths: string[]; message: string; author: unknown };
        if (!body.paths.includes('pages/about.json') || draftContent === null) {
          sendJson(res, 404, { statusCode: 404, error: 'Not Found', message: 'draft-not-found' });
          return;
        }
        liveContent = draftContent;
        liveEtag = nextEtag();
        draftContent = null;
        draftEtag = null;
        sendJson(res, 200, { ok: true });
      });
      return;
    }

    // G4: sets published:false on the live JSON in place, matching
    // the real agent - the file stays, only the flag changes.
    if (req.method === 'POST' && req.url === '/v1/unpublish/pages/about.json') {
      req.resume();
      req.on('end', () => {
        if (liveContent === null) {
          sendJson(res, 404, { statusCode: 404, error: 'Not Found', message: 'page-not-found' });
          return;
        }
        const parsed = JSON.parse(liveContent) as Record<string, unknown>;
        parsed.published = false;
        liveContent = JSON.stringify(parsed);
        liveEtag = nextEtag();
        sendJson(res, 200, { ok: true });
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

interface FakePreviewRevisionSiteOptions {
  acceptedToken: string;
}

// A minimal stand-in for the agent's own GET /v1/preview-revision/:ref/*,
// distinguishing a handful of fixed refs by name rather than genuinely
// parsing a ref the way the real agent does - enough surface to exercise
// the admin's proxy route's own outcome mapping (ok/invalid-ref/
// not-found-at-ref/unrenderable) end to end.
async function startFakePreviewRevisionSite(options: FakePreviewRevisionSiteOptions): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${options.acceptedToken}`) {
      sendJson(res, 401, { error: 'invalid-token' });
      return;
    }

    if (req.url === '/v1/preview-revision/abc123/about') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body>About, as it was</body></html>');
      return;
    }
    if (req.url === '/v1/preview-revision/not-a-real-ref/about') {
      sendJson(res, 400, { statusCode: 400, error: 'Bad Request', message: 'Invalid ref' });
      return;
    }
    if (req.url === '/v1/preview-revision/abc123/never-existed') {
      sendJson(res, 404, { statusCode: 404, error: 'Not Found', message: 'No page at "/never-existed"' });
      return;
    }
    if (req.url === '/v1/preview-revision/abc123/extinct-section') {
      sendJson(res, 422, { statusCode: 422, error: 'Unprocessable Entity', reason: 'missing-section-type' });
      return;
    }

    sendJson(res, 404, { statusCode: 404, error: 'Not Found' });
  };

  fakeSite = createServer(handler);
  await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
  const address = fakeSite.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a real listening address');
  }
  return `http://127.0.0.1:${address.port}`;
}

// A minimal but real stand-in for the agent's own git/log, git/show,
// git/revert routes, for H1-H4's own tests. Only understands a single
// fixed commit at content/pages/about.json - not a real git repo, just
// enough surface for the admin's proxy routes to be genuinely
// exercised end to end.
interface FakeGitSiteOptions {
  acceptedToken: string;
  onRevertBody?: (raw: string) => void;
}

async function startFakeGitSite(options: FakeGitSiteOptions): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${options.acceptedToken}`) {
      sendJson(res, 401, { error: 'invalid-token' });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/v1/git/log')) {
      sendJson(res, 200, {
        commits: [
          {
            hash: 'abc123',
            author: { name: 'Someone Else', email: 'someone@example.com' },
            date: '2026-01-01T00:00:00.000Z',
            message: 'Update about page',
            isCheckpoint: false,
          },
        ],
        hasMore: false,
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/git/show/HEAD/content/pages/about.json') {
      sendJson(res, 200, { title: 'Current' });
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/git/show/abc123/content/pages/about.json') {
      sendJson(res, 200, { title: 'Old' });
      return;
    }

    // Any ref containing "!" is treated as genuinely malformed here,
    // standing in for the real agent's own isValidGitRef whitelist -
    // this is what lets the invalid-ref (400) case be tested as a
    // real distinct outcome through the actual route, not just
    // documented as untestable with this fake.
    if (req.method === 'GET' && req.url?.startsWith('/v1/git/show/') && req.url.includes('!')) {
      sendJson(res, 400, { statusCode: 400, error: 'Bad Request', message: 'Invalid ref' });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/git/revert') {
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      req.on('end', () => {
        options.onRevertBody?.(raw);
        sendJson(res, 200, { ok: true });
      });
      return;
    }

    sendJson(res, 404, { statusCode: 404, error: 'Not Found' });
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

    const previewRevision = await app.inject({
      method: 'GET',
      url: '/api/sites/anything/preview-revision/abc123/about',
    });
    assert.equal(previewRevision.statusCode, 401);

    const discard = await app.inject({ method: 'DELETE', url: '/api/sites/anything/drafts/pages/about.json' });
    assert.equal(discard.statusCode, 401);

    const publish = await app.inject({
      method: 'POST',
      url: '/api/sites/anything/publish',
      payload: { path: 'pages/about.json', message: 'msg' },
    });
    assert.equal(publish.statusCode, 401);

    const unpublish = await app.inject({
      method: 'POST',
      url: '/api/sites/anything/unpublish/pages/about.json',
      payload: { message: 'msg' },
    });
    assert.equal(unpublish.statusCode, 401);

    const history = await app.inject({ method: 'GET', url: '/api/sites/anything/history/pages/about.json' });
    assert.equal(history.statusCode, 401);

    const revision = await app.inject({
      method: 'GET',
      url: '/api/sites/anything/revision/HEAD/pages/about.json',
    });
    assert.equal(revision.statusCode, 401);

    const revert = await app.inject({
      method: 'POST',
      url: '/api/sites/anything/revert',
      payload: { ref: 'abc123', path: 'pages/about.json', message: 'msg' },
    });
    assert.equal(revert.statusCode, 401);

    const themeSchemas = await app.inject({ method: 'GET', url: '/api/sites/anything/theme/schemas' });
    assert.equal(themeSchemas.statusCode, 401);

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
      { ...SAMPLE_ENTRY, path: 'pages/contact.json', name: 'Contact', title: 'Contact' },
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

  it('Group I: PUT /api/sites/:id/drafts/* forwards structured validation errors, pointing at the specific field', async () => {
    const { app, cookie } = await buildTestServer();
    const fieldErrors = [{ path: '/sections/0/settings/heading', message: 'must be string', keyword: 'type' }];
    fakeSite = createServer((req, res) => {
      if (req.headers.authorization !== 'Bearer the-token') {
        sendJson(res, 401, { error: 'invalid-token' });
        return;
      }
      if (req.method === 'PUT' && req.url === '/v1/drafts/pages/about.json') {
        sendJson(res, 400, { statusCode: 400, error: 'Bad Request', message: 'invalid content', errors: fieldErrors });
        return;
      }
      sendJson(res, 404, { error: 'not found' });
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'PUT',
      url: `/api/sites/${id}/drafts/pages/about.json`,
      headers: { cookie, 'if-match': '"any-etag"' },
      payload: { sections: [{ id: 'sec-1', type: 'hero', settings: { heading: 123 } }] },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json().errors, fieldErrors);

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

  it('GET /api/sites/:id/preview-revision/:ref/* forwards the real rendered HTML for that revision', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakePreviewRevisionSite({ acceptedToken: 'the-token' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/preview-revision/abc123/about`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(response.body, '<html><body>About, as it was</body></html>');

    await app.close();
  });

  it('GET /api/sites/:id/preview-revision/:ref/* keeps invalid-ref (400) and not-found-at-ref (404) distinct', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakePreviewRevisionSite({ acceptedToken: 'the-token' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const invalidRef = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/preview-revision/not-a-real-ref/about`,
      headers: { cookie },
    });
    assert.equal(invalidRef.statusCode, 400);

    const notFoundAtRef = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/preview-revision/abc123/never-existed`,
      headers: { cookie },
    });
    assert.equal(notFoundAtRef.statusCode, 404);
    assert.equal(notFoundAtRef.json().reason, 'not-found-at-ref');

    await app.close();
  });

  it('GET /api/sites/:id/preview-revision/:ref/* returns 422 with reason "unrenderable" when the theme no longer matches', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakePreviewRevisionSite({ acceptedToken: 'the-token' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/preview-revision/abc123/extinct-section`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 422);
    assert.equal(response.json().reason, 'unrenderable');

    await app.close();
  });

  it('GET /api/sites/:id/preview-revision/:ref/* returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/does-not-exist/preview-revision/abc123/about',
      headers: { cookie },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('G1: POST /api/sites/:id/publish sends the logged-in admin\'s own name/email as author, never something the caller supplied', async () => {
    const { app, cookie } = await buildTestServer();
    let receivedBody = '';
    const siteUrl = await startFakeEditorSite({
      acceptedToken: 'the-token',
      draftContent: '{"title":"Draft"}',
      onPublishBody: (raw) => {
        receivedBody = raw;
      },
    });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/publish`,
      headers: { cookie },
      payload: { path: 'pages/about.json', message: 'Ship the new about page' },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
    assert.deepEqual(JSON.parse(receivedBody), {
      paths: ['pages/about.json'],
      message: 'Ship the new about page',
      author: { name: TEST_NAME, email: TEST_EMAIL },
    });

    // G2: the draft is now gone and live reflects it, proven through
    // the real content routes, not just the fake site's internal state.
    const afterRead = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content/pages/about.json`,
      headers: { cookie },
    });
    assert.equal(afterRead.headers['x-content-source'], 'live');
    assert.deepEqual(JSON.parse(afterRead.body), { title: 'Draft' });

    await app.close();
  });

  it('G1: POST /api/sites/:id/publish rejects a missing/blank message with 400, without ever calling the site', async () => {
    const { app, cookie } = await buildTestServer();
    let publishWasCalled = false;
    fakeSite = createServer((req, res) => {
      // Registration performs its own live status check first - only
      // a real call to /v1/publish itself should ever flip this flag.
      if (req.method === 'POST' && req.url === '/v1/publish') {
        publishWasCalled = true;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'any-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/publish`,
      headers: { cookie },
      payload: { path: 'pages/about.json', message: '  ' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(publishWasCalled, false, 'a blank message must be rejected before ever reaching the site');

    await app.close();
  });

  it('G1: POST /api/sites/:id/publish returns 404 with reason "not-found" when the draft no longer exists', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({ acceptedToken: 'the-token' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/publish`,
      headers: { cookie },
      payload: { path: 'pages/about.json', message: 'msg' },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().reason, 'not-found');

    await app.close();
  });

  it('POST /api/sites/:id/publish returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/sites/does-not-exist/publish',
      headers: { cookie },
      payload: { path: 'pages/about.json', message: 'msg' },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('POST /api/sites/:id/publish returns 502 with reason "unreachable" for an unreachable site', async () => {
    const { app, cookie } = await buildTestServer();
    const id = await registerSite(app, cookie, 'http://127.0.0.1:1', 'any-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/publish`,
      headers: { cookie },
      payload: { path: 'pages/about.json', message: 'msg' },
    });

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().reason, 'unreachable');

    await app.close();
  });

  it('G3: DELETE /api/sites/:id/drafts/* discards the draft with no request body, returning 204', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({ acceptedToken: 'the-token', draftContent: '{"title":"Draft"}' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${id}/drafts/pages/about.json`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 204);

    const afterRead = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content/pages/about.json`,
      headers: { cookie },
    });
    assert.equal(afterRead.statusCode, 404, 'the draft is gone and there was no live version either');

    await app.close();
  });

  it('G4: POST /api/sites/:id/unpublish/* flips published to false on the live page in place', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeEditorSite({
      acceptedToken: 'the-token',
      liveContent: '{"title":"About","published":true}',
    });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/unpublish/pages/about.json`,
      headers: { cookie },
      payload: { message: 'Taking this offline' },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });

    const afterRead = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/content/pages/about.json`,
      headers: { cookie },
    });
    const body = JSON.parse(afterRead.body) as { title: string; published: boolean };
    assert.equal(body.title, 'About', 'the file stays - unpublish never deletes it');
    assert.equal(body.published, false);

    await app.close();
  });

  it('G4: POST /api/sites/:id/unpublish/* rejects a missing message with 400, without ever calling the site', async () => {
    const { app, cookie } = await buildTestServer();
    let unpublishWasCalled = false;
    fakeSite = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/unpublish/pages/about.json') {
        unpublishWasCalled = true;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'any-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/unpublish/pages/about.json`,
      headers: { cookie },
      payload: {},
    });

    assert.equal(response.statusCode, 400);
    assert.equal(unpublishWasCalled, false);

    await app.close();
  });

  it('POST /api/sites/:id/unpublish/* returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/sites/does-not-exist/unpublish/pages/about.json',
      headers: { cookie },
      payload: { message: 'msg' },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('H1: GET /api/sites/:id/history/* lists commits from the real git log route', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeGitSite({ acceptedToken: 'the-token' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/history/pages/about.json`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { commits: Array<{ hash: string }>; hasMore: boolean };
    assert.equal(body.commits[0]?.hash, 'abc123');
    assert.equal(body.hasMore, false);

    await app.close();
  });

  it('GET /api/sites/:id/history/* rejects a non-positive-integer limit with 400, without ever calling the site', async () => {
    const { app, cookie } = await buildTestServer();
    let historyWasCalled = false;
    fakeSite = createServer((req, res) => {
      if (req.method === 'GET' && req.url?.startsWith('/v1/git/log')) {
        historyWasCalled = true;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'any-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/history/pages/about.json?limit=0`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(historyWasCalled, false);

    await app.close();
  });

  it('GET /api/sites/:id/history/* returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/does-not-exist/history/pages/about.json',
      headers: { cookie },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('H3: GET /api/sites/:id/revision/HEAD/* round-trips current content through the real route', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeGitSite({ acceptedToken: 'the-token' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/revision/HEAD/pages/about.json`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { title: 'Current' });

    await app.close();
  });

  it('H3: GET /api/sites/:id/revision/:ref/* also fetches a real earlier revision', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeGitSite({ acceptedToken: 'the-token' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/revision/abc123/pages/about.json`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { title: 'Old' });

    await app.close();
  });

  it('GET /api/sites/:id/revision/:ref/* keeps invalid-ref (400) and not-found-at-ref (404) distinct', async () => {
    const { app, cookie } = await buildTestServer();
    const siteUrl = await startFakeGitSite({ acceptedToken: 'the-token' });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const invalidRef = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/revision/not-a-real-ref%21/pages/about.json`,
      headers: { cookie },
    });
    assert.equal(invalidRef.statusCode, 400);
    assert.equal(invalidRef.json().error, 'Bad Request');

    const notFoundAtRef = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/revision/abc123/pages/never-existed.json`,
      headers: { cookie },
    });
    assert.equal(notFoundAtRef.statusCode, 404);
    assert.equal(notFoundAtRef.json().reason, 'not-found-at-ref');

    await app.close();
  });

  it('GET /api/sites/:id/revision/:ref/* returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/does-not-exist/revision/HEAD/pages/about.json',
      headers: { cookie },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('H4: POST /api/sites/:id/revert sends the logged-in admin\'s own name/email as author, never something the caller supplied', async () => {
    const { app, cookie } = await buildTestServer();
    let receivedBody = '';
    const siteUrl = await startFakeGitSite({
      acceptedToken: 'the-token',
      onRevertBody: (raw) => {
        receivedBody = raw;
      },
    });
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/revert`,
      headers: { cookie },
      payload: { ref: 'abc123', path: 'pages/about.json', message: 'Revert to earlier version' },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
    assert.deepEqual(JSON.parse(receivedBody), {
      ref: 'abc123',
      paths: ['content/pages/about.json'],
      message: 'Revert to earlier version',
      author: { name: TEST_NAME, email: TEST_EMAIL },
    });

    await app.close();
  });

  it('POST /api/sites/:id/revert rejects a missing ref/path/message with 400, without ever calling the site', async () => {
    const { app, cookie } = await buildTestServer();
    let siteWasCalled = false;
    fakeSite = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/git/revert') {
        siteWasCalled = true;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'any-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/revert`,
      headers: { cookie },
      payload: { ref: 'abc123', path: '', message: 'msg' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(siteWasCalled, false);

    await app.close();
  });

  it('POST /api/sites/:id/revert returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/sites/does-not-exist/revert',
      headers: { cookie },
      payload: { ref: 'abc123', path: 'pages/about.json', message: 'msg' },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it("POST /api/sites/:id/move sends the logged-in admin's own name/email as author and createRedirect: false, never something the caller supplied", async () => {
    const { app, cookie } = await buildTestServer();
    let receivedBody = '';
    fakeSite = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/content/move') {
        let raw = '';
        req.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        req.on('end', () => {
          receivedBody = raw;
          sendJson(res, 200, { ok: true });
        });
        return;
      }
      sendJson(res, 404, { error: 'not found' });
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'any-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/move`,
      headers: { cookie },
      payload: { from: '/about', to: '/company', message: 'Rename slug' },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
    assert.deepEqual(JSON.parse(receivedBody), {
      from: '/about',
      to: '/company',
      message: 'Rename slug',
      author: { name: TEST_NAME, email: TEST_EMAIL },
      createRedirect: false,
    });

    await app.close();
  });

  it('POST /api/sites/:id/move rejects a missing from/to/message with 400, without ever calling the site', async () => {
    const { app, cookie } = await buildTestServer();
    let siteWasCalled = false;
    fakeSite = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/content/move') {
        siteWasCalled = true;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'any-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/move`,
      headers: { cookie },
      payload: { from: '/about', to: '', message: 'msg' },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(siteWasCalled, false);

    await app.close();
  });

  it('POST /api/sites/:id/move returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/sites/does-not-exist/move',
      headers: { cookie },
      payload: { from: '/about', to: '/company', message: 'msg' },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('I2: GET /api/sites/:id/theme/schemas forwards the real theme schemas from the site', async () => {
    const { app, cookie } = await buildTestServer();
    const schemas = {
      sections: { hero: { type: 'object', properties: { heading: { type: 'string' } } } },
      blocks: { button: { type: 'object', properties: { label: { type: 'string' } } } },
      acceptsBlocks: { sections: { hero: true }, blocks: { button: false } },
    };
    fakeSite = createServer((req, res) => {
      if (req.headers.authorization !== 'Bearer the-token') {
        sendJson(res, 401, { error: 'invalid-token' });
        return;
      }
      if (req.method === 'GET' && req.url === '/v1/theme/schemas') {
        sendJson(res, 200, schemas);
        return;
      }
      sendJson(res, 404, { error: 'not found' });
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/theme/schemas`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), schemas);

    await app.close();
  });

  it('GET /api/sites/:id/theme/schemas returns 404 for an unknown site', async () => {
    const { app, cookie } = await buildTestServer();

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/does-not-exist/theme/schemas',
      headers: { cookie },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  it('GET /api/sites/:id/theme/schemas returns 502 for an unreachable site', async () => {
    const { app, cookie } = await buildTestServer();
    const id = await registerSite(app, cookie, 'http://127.0.0.1:1', 'any-token');

    const response = await app.inject({
      method: 'GET',
      url: `/api/sites/${id}/theme/schemas`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().reason, 'unreachable');

    await app.close();
  });

  // Hand-builds a minimal, valid multipart/form-data body - same
  // approach the agent repo's own routes/media.test.ts uses, since
  // light-my-request's .inject() accepts an arbitrary raw
  // payload/headers with no higher-level form-building helper needed.
  function buildMultipartBody(
    filename: string,
    mimetype: string,
    bytes: Buffer,
  ): { payload: Buffer; contentType: string } {
    const boundary = '----adminTestBoundary';
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    return {
      payload: Buffer.concat([head, bytes, tail]),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  it('GET /api/sites/:id/media forwards the list, with each url rewritten absolute', async () => {
    const { app, cookie } = await buildTestServer();
    fakeSite = createServer((req, res) => {
      if (req.url === '/v1/capabilities') {
        sendJson(res, 200, { maxMediaUploadBytes: 5000 });
        return;
      }
      if (req.headers.authorization !== 'Bearer the-token') {
        sendJson(res, 401, { error: 'invalid-token' });
        return;
      }
      sendJson(res, 200, [{ name: 'photo.jpg', size: 5, mtimeMs: 123, url: '/media/photo.jpg' }]);
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const response = await app.inject({ method: 'GET', url: `/api/sites/${id}/media`, headers: { cookie } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      items: [{ name: 'photo.jpg', size: 5, mtimeMs: 123, url: `${siteUrl}/media/photo.jpg` }],
      maxUploadBytes: 5000,
    });

    await app.close();
  });

  it('GET /api/sites/:id/media returns 502 for an unreachable site', async () => {
    const { app, cookie } = await buildTestServer();
    const id = await registerSite(app, cookie, 'http://127.0.0.1:1', 'any-token');

    const response = await app.inject({ method: 'GET', url: `/api/sites/${id}/media`, headers: { cookie } });

    assert.equal(response.statusCode, 502);
    assert.equal(response.json().reason, 'unreachable');

    await app.close();
  });

  it('POST /api/sites/:id/media forwards the upload and reports the site-returned url absolute', async () => {
    const { app, cookie } = await buildTestServer();
    let receivedContentType: string | undefined;
    fakeSite = createServer((req, res) => {
      if (req.headers.authorization !== 'Bearer the-token') {
        sendJson(res, 401, { error: 'invalid-token' });
        return;
      }
      receivedContentType = req.headers['content-type'];
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => sendJson(res, 201, { name: 'photo.jpg', size: 5, url: '/media/photo.jpg' }));
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const siteUrl = `http://127.0.0.1:${address.port}`;
    const id = await registerSite(app, cookie, siteUrl, 'the-token');

    const { payload, contentType } = buildMultipartBody('photo.jpg', 'image/jpeg', Buffer.from('hello'));
    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/media`,
      headers: { cookie, 'content-type': contentType },
      payload,
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json(), { name: 'photo.jpg', size: 5, url: `${siteUrl}/media/photo.jpg` });
    assert.match(receivedContentType ?? '', /^multipart\/form-data; boundary=/);

    await app.close();
  });

  it('POST /api/sites/:id/media returns 400 when the request has no file part', async () => {
    const { app, cookie } = await buildTestServer();
    const id = await registerSite(app, cookie, 'http://127.0.0.1:1', 'any-token');
    // No filename param on the Content-Disposition - busboy (underneath
    // @fastify/multipart) treats a part as a plain field, not a file,
    // purely based on the presence of filename, regardless of the part's
    // own field name.
    const boundary = '----adminTestBoundaryNoFile';
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="notes"\r\n\r\nhello\r\n--${boundary}--\r\n`,
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/media`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    assert.equal(response.statusCode, 400);

    await app.close();
  });

  it('POST /api/sites/:id/media forwards a site 415 for an unsupported type', async () => {
    const { app, cookie } = await buildTestServer();
    fakeSite = createServer((_req, res) => sendJson(res, 415, { error: 'bad type' }));
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const id = await registerSite(app, cookie, `http://127.0.0.1:${address.port}`, 'the-token');
    const { payload, contentType } = buildMultipartBody('icon.svg', 'image/svg+xml', Buffer.from('<svg/>'));

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/media`,
      headers: { cookie, 'content-type': contentType },
      payload,
    });

    assert.equal(response.statusCode, 415);

    await app.close();
  });

  it('DELETE /api/sites/:id/media/:name forwards the delete', async () => {
    const { app, cookie } = await buildTestServer();
    let receivedMethod = '';
    let receivedPath = '';
    fakeSite = createServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedPath = req.url ?? '';
      res.writeHead(204);
      res.end();
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const id = await registerSite(app, cookie, `http://127.0.0.1:${address.port}`, 'the-token');

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${id}/media/photo.jpg`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 204);
    assert.equal(receivedMethod, 'DELETE');
    assert.equal(receivedPath, '/v1/media/photo.jpg');

    await app.close();
  });

  it('DELETE /api/sites/:id/media/:name returns 404 when the site reports not-found', async () => {
    const { app, cookie } = await buildTestServer();
    fakeSite = createServer((_req, res) => sendJson(res, 404, { error: 'not found' }));
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const id = await registerSite(app, cookie, `http://127.0.0.1:${address.port}`, 'the-token');

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${id}/media/missing.jpg`,
      headers: { cookie },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });

  const REDIRECT_ENTRY = { from: '/old', to: '/new', note: 'moved page' };

  it('GET /api/sites/:id/redirects forwards the entries list', async () => {
    const { app, cookie } = await buildTestServer();
    fakeSite = createServer((_req, res) => sendJson(res, 200, { schemaVersion: 1, entries: [REDIRECT_ENTRY] }));
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const id = await registerSite(app, cookie, `http://127.0.0.1:${address.port}`, 'the-token');

    const response = await app.inject({ method: 'GET', url: `/api/sites/${id}/redirects`, headers: { cookie } });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { entries: [REDIRECT_ENTRY] });

    await app.close();
  });

  it('POST /api/sites/:id/redirects sends the logged-in admin\'s own name/email as author, never something the caller supplied', async () => {
    const { app, cookie } = await buildTestServer();
    let receivedBody: Record<string, unknown> = {};
    fakeSite = createServer((req, res) => {
      // Registering a site triggers its own GET /v1/capabilities call
      // first (checkSiteStatus) - matching every other body-forwarding
      // test in this file (e.g. POST /:id/move below), a real request
      // has to be distinguished from that one, or its own empty body
      // fails to parse as JSON before this test's real request ever
      // arrives.
      if (req.method !== 'POST' || req.url !== '/v1/redirects') {
        sendJson(res, 200, { agentVersion: '1.0.0', contentSchemaVersion: 3, sqliteDriver: 'node:sqlite' });
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString());
        sendJson(res, 200, { entry: REDIRECT_ENTRY, retargeted: [] });
      });
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const id = await registerSite(app, cookie, `http://127.0.0.1:${address.port}`, 'the-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/redirects`,
      headers: { cookie },
      payload: { from: '/old', to: '/new', note: 'moved page', message: 'Add redirect', author: { name: 'Attacker', email: 'x@x.com' } },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { entry: REDIRECT_ENTRY, retargeted: [] });
    assert.equal(receivedBody.author && (receivedBody.author as { name: string }).name, 'Jane Editor');

    await app.close();
  });

  it('POST /api/sites/:id/redirects rejects a missing from/to/message with 400, without ever calling the site', async () => {
    const { app, cookie } = await buildTestServer();
    const id = await registerSite(app, cookie, 'http://127.0.0.1:1', 'any-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/redirects`,
      headers: { cookie },
      payload: { from: '/old' },
    });

    assert.equal(response.statusCode, 400);

    await app.close();
  });

  it('POST /api/sites/:id/redirects forwards a site 409 as a real conflict, with the site\'s own message', async () => {
    const { app, cookie } = await buildTestServer();
    fakeSite = createServer((_req, res) => sendJson(res, 409, { message: 'A redirect from that path already exists' }));
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const id = await registerSite(app, cookie, `http://127.0.0.1:${address.port}`, 'the-token');

    const response = await app.inject({
      method: 'POST',
      url: `/api/sites/${id}/redirects`,
      headers: { cookie },
      payload: { from: '/old', to: '/new', message: 'Add redirect' },
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().message, 'A redirect from that path already exists');

    await app.close();
  });

  it('PUT /api/sites/:id/redirects updates the entry matched by from', async () => {
    const { app, cookie } = await buildTestServer();
    let receivedMethod = '';
    fakeSite = createServer((req, res) => {
      receivedMethod = req.method ?? '';
      sendJson(res, 200, { entry: { from: '/old', to: '/newer' }, retargeted: [] });
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const id = await registerSite(app, cookie, `http://127.0.0.1:${address.port}`, 'the-token');

    const response = await app.inject({
      method: 'PUT',
      url: `/api/sites/${id}/redirects`,
      headers: { cookie },
      payload: { from: '/old', to: '/newer', message: 'Update redirect' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(receivedMethod, 'PUT');
    assert.deepEqual(response.json(), { entry: { from: '/old', to: '/newer' }, retargeted: [] });

    await app.close();
  });

  it('DELETE /api/sites/:id/redirects removes the entry matched by from in the body', async () => {
    const { app, cookie } = await buildTestServer();
    let receivedMethod = '';
    let receivedBody: Record<string, unknown> = {};
    fakeSite = createServer((req, res) => {
      // See the POST test above for why non-matching requests (the
      // capabilities pre-check from registration) need their own,
      // separate branch here.
      if (req.method !== 'DELETE' || req.url !== '/v1/redirects') {
        sendJson(res, 200, { agentVersion: '1.0.0', contentSchemaVersion: 3, sqliteDriver: 'node:sqlite' });
        return;
      }
      receivedMethod = req.method ?? '';
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString());
        res.writeHead(204);
        res.end();
      });
    });
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const id = await registerSite(app, cookie, `http://127.0.0.1:${address.port}`, 'the-token');

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${id}/redirects`,
      headers: { cookie },
      payload: { from: '/old', message: 'Remove redirect' },
    });

    assert.equal(response.statusCode, 204);
    assert.equal(receivedMethod, 'DELETE');
    assert.equal(receivedBody.from, '/old');

    await app.close();
  });

  it('DELETE /api/sites/:id/redirects returns 404 when the site reports not-found', async () => {
    const { app, cookie } = await buildTestServer();
    fakeSite = createServer((_req, res) => sendJson(res, 404, { message: 'No redirect found at that path' }));
    await new Promise<void>((resolve) => fakeSite!.listen(0, '127.0.0.1', resolve));
    const address = fakeSite.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    const id = await registerSite(app, cookie, `http://127.0.0.1:${address.port}`, 'the-token');

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/sites/${id}/redirects`,
      headers: { cookie },
      payload: { from: '/gone', message: 'Remove redirect' },
    });

    assert.equal(response.statusCode, 404);

    await app.close();
  });
});
