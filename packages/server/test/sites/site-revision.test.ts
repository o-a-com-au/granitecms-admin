import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSiteRevision } from '../../src/sites/site-revision.ts';

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

describe('fetchSiteRevision', () => {
  it('H3: GETs /v1/git/show/:ref/content/:path with the stored token', async () => {
    let receivedPath = '';
    let receivedAuth: string | undefined;
    const url = await startServer((req, res) => {
      receivedPath = req.url ?? '';
      receivedAuth = req.headers.authorization;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"title":"v1"}');
    });

    const result = await fetchSiteRevision({ url, token: 'my-token' }, 'abc123', 'pages/about.json');

    assert.equal(result.outcome, 'ok');
    if (result.outcome === 'ok') {
      assert.equal(new TextDecoder().decode(result.body), '{"title":"v1"}');
    }
    assert.equal(receivedPath, '/v1/git/show/abc123/content/pages/about.json');
    assert.equal(receivedAuth, 'Bearer my-token');
  });

  it('H3: the literal ref "HEAD" is passed through unmodified - the "compare against current" mechanism', async () => {
    let receivedPath = '';
    const url = await startServer((req, res) => {
      receivedPath = req.url ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"title":"current"}');
    });

    await fetchSiteRevision({ url, token: 'x' }, 'HEAD', 'pages/about.json');

    assert.equal(receivedPath, '/v1/git/show/HEAD/content/pages/about.json');
  });

  it('a 400 is reported as invalid-ref, distinct from not-found-at-ref', async () => {
    const url = await startServer((_req, res) => sendJson(res, 400, { statusCode: 400, error: 'Bad Request' }));

    const result = await fetchSiteRevision({ url, token: 'x' }, 'not-a-ref!!', 'pages/about.json');
    assert.equal(result.outcome, 'invalid-ref');
  });

  it('a 404 is reported as not-found-at-ref, distinct from invalid-ref', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { statusCode: 404, error: 'Not Found' }));

    const result = await fetchSiteRevision({ url, token: 'x' }, 'abc123', 'pages/never-existed.json');
    assert.equal(result.outcome, 'not-found-at-ref');
  });

  it('unreachable: nothing listening', async () => {
    const result = await fetchSiteRevision({ url: 'http://127.0.0.1:1', token: 'x' }, 'HEAD', 'pages/about.json');
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));

    const result = await fetchSiteRevision({ url, token: 'bad' }, 'HEAD', 'pages/about.json');
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: an unmapped status', async () => {
    const url = await startServer((_req, res) => sendJson(res, 500, { error: 'boom' }));

    const result = await fetchSiteRevision({ url, token: 'x' }, 'HEAD', 'pages/about.json');
    assert.equal(result.outcome, 'error');
  });
});
