import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSitePreviewRevision } from '../../src/sites/site-preview-revision.ts';

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

describe('fetchSitePreviewRevision', () => {
  it('GETs /v1/preview-revision/:ref/*urlPath and forwards a real rendered HTML page verbatim', async () => {
    let receivedPath = '';
    let receivedAuth: string | undefined;
    const url = await startServer((req, res) => {
      receivedPath = req.url ?? '';
      receivedAuth = req.headers.authorization;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body>About, as it was</body></html>');
    });

    const result = await fetchSitePreviewRevision({ url, token: 'my-token' }, '/about', 'abc123');

    assert.equal(receivedPath, '/v1/preview-revision/abc123/about');
    assert.equal(receivedAuth, 'Bearer my-token');
    assert.equal(result.outcome, 'ok');
    if (result.outcome === 'ok') {
      assert.equal(result.status, 200);
      assert.equal(result.contentType, 'text/html; charset=utf-8');
      assert.equal(new TextDecoder().decode(result.body), '<html><body>About, as it was</body></html>');
    }
  });

  it('injects a <base> tag pointing at the real site origin', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><head><link rel="stylesheet" href="/assets/style.css"></head><body>Home</body></html>');
    });

    const result = await fetchSitePreviewRevision({ url, token: 'x' }, '/', 'abc123');

    assert.equal(result.outcome, 'ok');
    if (result.outcome === 'ok') {
      const html = new TextDecoder().decode(result.body);
      assert.equal(html, `<html><head><base href="${url}/"><link rel="stylesheet" href="/assets/style.css"></head><body>Home</body></html>`);
    }
  });

  it('invalid-ref: the site rejects the ref with a 400', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 400, error: 'Bad Request', message: 'Invalid ref' }));
    });

    const result = await fetchSitePreviewRevision({ url, token: 'x' }, '/about', 'not-a-ref');
    assert.equal(result.outcome, 'invalid-ref');
  });

  it('not-found-at-ref: the site reports a 404', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 404, error: 'Not Found', message: 'No page at "/about"' }));
    });

    const result = await fetchSitePreviewRevision({ url, token: 'x' }, '/about', 'abc123');
    assert.equal(result.outcome, 'not-found-at-ref');
  });

  it('unrenderable: the site reports a 422 (theme no longer matches this revision)', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(422, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 422, error: 'Unprocessable Entity', reason: 'missing-section-type' }));
    });

    const result = await fetchSitePreviewRevision({ url, token: 'x' }, '/about', 'abc123');
    assert.equal(result.outcome, 'unrenderable');
  });

  it('error: an unmapped status', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
    });

    const result = await fetchSitePreviewRevision({ url, token: 'x' }, '/about', 'abc123');
    assert.equal(result.outcome, 'error');
  });

  it('unreachable: nothing listening', async () => {
    const result = await fetchSitePreviewRevision({ url: 'http://127.0.0.1:1', token: 'x' }, '/about', 'abc123');
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the stored token was rejected', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid-token' }));
    });

    const result = await fetchSitePreviewRevision({ url, token: 'bad' }, '/about', 'abc123');
    assert.equal(result.outcome, 'unauthorized');
  });
});
