import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSiteContent } from '../../src/sites/site-content.ts';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server | undefined;

async function startServer(handler: Handler): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a real listening address');
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const SAMPLE_ENTRY = { path: 'pages/about.json', title: 'About', type: 'page', published: true, hasDraft: false };

describe('fetchSiteContent', () => {
  it('ok: returns the entries on a successful response', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, [SAMPLE_ENTRY]));

    const result = await fetchSiteContent({ url, token: 'a-token' }, {});
    assert.deepEqual(result, { outcome: 'ok', entries: [SAMPLE_ENTRY] });
  });

  it('forwards type, prefix, and draftStatus as query params', async () => {
    let receivedUrl = '';
    const url = await startServer((req, res) => {
      receivedUrl = req.url ?? '';
      sendJson(res, 200, []);
    });

    await fetchSiteContent({ url, token: 'a-token' }, { type: 'page', prefix: 'blog/', draftStatus: 'has-draft' });

    const params = new URLSearchParams(receivedUrl.split('?')[1]);
    assert.equal(params.get('type'), 'page');
    assert.equal(params.get('prefix'), 'blog/');
    assert.equal(params.get('draftStatus'), 'has-draft');
  });

  it('sends the stored token as a Bearer header', async () => {
    let receivedAuth: string | undefined;
    const url = await startServer((req, res) => {
      receivedAuth = req.headers.authorization;
      sendJson(res, 200, []);
    });

    await fetchSiteContent({ url, token: 'my-real-token' }, {});
    assert.equal(receivedAuth, 'Bearer my-real-token');
  });

  it('unreachable: nothing is listening at the given URL', async () => {
    const result = await fetchSiteContent({ url: 'http://127.0.0.1:1', token: 'x' }, {});
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: a 401 from the site', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));

    const result = await fetchSiteContent({ url, token: 'bad-token' }, {});
    assert.equal(result.outcome, 'unauthorized');
  });

  it('unauthorized: a 403 (wrong scope) is treated the same as a 401', async () => {
    const url = await startServer((_req, res) => sendJson(res, 403, { error: 'missing-scope' }));

    const result = await fetchSiteContent({ url, token: 'wrong-scope-token' }, {});
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: a non-2xx, non-auth status', async () => {
    const url = await startServer((_req, res) => sendJson(res, 500, { error: 'boom' }));

    const result = await fetchSiteContent({ url, token: 'x' }, {});
    assert.equal(result.outcome, 'error');
  });

  it('error: a 200 response that is not a content-list-shaped array', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, { not: 'an array' }));

    const result = await fetchSiteContent({ url, token: 'x' }, {});
    assert.equal(result.outcome, 'error');
  });

  it('error: a 200 response whose array entries are malformed', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, [{ path: 'only-a-path' }]));

    const result = await fetchSiteContent({ url, token: 'x' }, {});
    assert.equal(result.outcome, 'error');
  });

  it('never crashes on a genuinely malformed response body', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('not json {{{');
    });

    const result = await fetchSiteContent({ url, token: 'x' }, {});
    assert.equal(result.outcome, 'error');
  });
});
