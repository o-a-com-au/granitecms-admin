import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSiteContentHistory, fetchSiteHistory } from '../../src/sites/site-history.ts';

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

const COMMIT = {
  hash: 'abc123',
  author: { name: 'Jane Editor', email: 'jane@example.com' },
  date: '2026-01-01T00:00:00.000Z',
  message: 'Update about page',
  isCheckpoint: false,
};

describe('fetchSiteHistory', () => {
  it('H1: GETs /v1/git/log with the content/ prefix and the stored token', async () => {
    let receivedPath = '';
    let receivedAuth: string | undefined;
    const url = await startServer((req, res) => {
      receivedPath = req.url ?? '';
      receivedAuth = req.headers.authorization;
      sendJson(res, 200, { commits: [COMMIT], hasMore: false });
    });

    const result = await fetchSiteHistory({ url, token: 'my-token' }, 'pages/about.json', 100);

    assert.deepEqual(result, { outcome: 'ok', commits: [COMMIT], hasMore: false });
    assert.equal(receivedPath, '/v1/git/log?path=content%2Fpages%2Fabout.json&limit=100');
    assert.equal(receivedAuth, 'Bearer my-token');
  });

  it('a 404 is reported as not-found', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { statusCode: 404, error: 'Not Found' }));

    const result = await fetchSiteHistory({ url, token: 'x' }, 'pages/about.json', 100);
    assert.equal(result.outcome, 'not-found');
  });

  it('unreachable: nothing listening', async () => {
    const result = await fetchSiteHistory({ url: 'http://127.0.0.1:1', token: 'x' }, 'pages/about.json', 100);
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));

    const result = await fetchSiteHistory({ url, token: 'bad' }, 'pages/about.json', 100);
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: an unmapped status', async () => {
    const url = await startServer((_req, res) => sendJson(res, 500, { error: 'boom' }));

    const result = await fetchSiteHistory({ url, token: 'x' }, 'pages/about.json', 100);
    assert.equal(result.outcome, 'error');
  });

  it('error: a 200 with a malformed body, never a crash', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, { commits: 'not an array' }));

    const result = await fetchSiteHistory({ url, token: 'x' }, 'pages/about.json', 100);
    assert.equal(result.outcome, 'error');
  });

  it('error: a 200 with non-JSON body', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('not json');
    });

    const result = await fetchSiteHistory({ url, token: 'x' }, 'pages/about.json', 100);
    assert.equal(result.outcome, 'error');
  });
});

describe('fetchSiteContentHistory', () => {
  it('GETs /v1/git/log scoped to the bare "content" path, not a page/theme/config path', async () => {
    let receivedPath = '';
    let receivedAuth: string | undefined;
    const url = await startServer((req, res) => {
      receivedPath = req.url ?? '';
      receivedAuth = req.headers.authorization;
      sendJson(res, 200, { commits: [COMMIT], hasMore: false });
    });

    const result = await fetchSiteContentHistory({ url, token: 'my-token' }, 100);

    assert.deepEqual(result, { outcome: 'ok', commits: [COMMIT], hasMore: false });
    assert.equal(receivedPath, '/v1/git/log?path=content&limit=100');
    assert.equal(receivedAuth, 'Bearer my-token');
  });

  it('unreachable: nothing listening', async () => {
    const result = await fetchSiteContentHistory({ url: 'http://127.0.0.1:1', token: 'x' }, 100);
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));
    const result = await fetchSiteContentHistory({ url, token: 'bad' }, 100);
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: an unmapped status', async () => {
    const url = await startServer((_req, res) => sendJson(res, 500, { error: 'boom' }));
    const result = await fetchSiteContentHistory({ url, token: 'x' }, 100);
    assert.equal(result.outcome, 'error');
  });

  it('error: a 200 with a malformed body, never a crash', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, { commits: 'not an array' }));
    const result = await fetchSiteContentHistory({ url, token: 'x' }, 100);
    assert.equal(result.outcome, 'error');
  });
});
