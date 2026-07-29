import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSitePreview } from '../../src/sites/site-preview.ts';

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

describe('fetchSitePreview', () => {
  it('F1, F3: forwards a real rendered HTML page verbatim, status and content-type included', async () => {
    let receivedPath = '';
    const url = await startServer((req, res) => {
      receivedPath = req.url ?? '';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body>Draft About</body></html>');
    });

    const result = await fetchSitePreview({ url, token: 'x' }, '/about');

    assert.equal(receivedPath, '/v1/preview/about');
    assert.equal(result.outcome, 'ok');
    if (result.outcome === 'ok') {
      assert.equal(result.status, 200);
      assert.equal(result.contentType, 'text/html; charset=utf-8');
      assert.equal(new TextDecoder().decode(result.body), '<html><body>Draft About</body></html>');
    }
  });

  it('F4: forwards the site\'s own 404 JSON verbatim - not swallowed or transformed', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 404, error: 'Not Found', message: 'No page at "/nope"' }));
    });

    const result = await fetchSitePreview({ url, token: 'x' }, '/nope');

    assert.equal(result.outcome, 'ok');
    if (result.outcome === 'ok') {
      assert.equal(result.status, 404);
      assert.equal(result.contentType, 'application/json');
      const body = JSON.parse(new TextDecoder().decode(result.body)) as { message: string };
      assert.equal(body.message, 'No page at "/nope"');
    }
  });

  it('the root URL is preserved as a single slash, not stripped', async () => {
    let receivedPath = '';
    const url = await startServer((req, res) => {
      receivedPath = req.url ?? '';
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html></html>');
    });

    await fetchSitePreview({ url, token: 'x' }, '/');

    assert.equal(receivedPath, '/v1/preview/');
  });

  it('unreachable: nothing listening', async () => {
    const result = await fetchSitePreview({ url: 'http://127.0.0.1:1', token: 'x' }, '/about');
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the token was rejected', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid-token' }));
    });

    const result = await fetchSitePreview({ url, token: 'bad' }, '/about');
    assert.equal(result.outcome, 'unauthorized');
  });
});
