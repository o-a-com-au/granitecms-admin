import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSiteEditorContent } from '../../src/sites/site-editor-content.ts';

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

function sendJson(res: ServerResponse, status: number, body: unknown, etag?: string): void {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (etag) {
    headers.etag = etag;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

describe('fetchSiteEditorContent', () => {
  it('E1: returns the draft when one exists, never calling live at all', async () => {
    let liveWasCalled = false;
    const url = await startServer((req, res) => {
      if (req.url === '/v1/drafts/pages/about.json') {
        sendJson(res, 200, { title: 'Draft About' }, '"draft-etag"');
        return;
      }
      if (req.url === '/v1/content/pages/about.json') {
        liveWasCalled = true;
        sendJson(res, 200, { title: 'Live About' }, '"live-etag"');
        return;
      }
      sendJson(res, 404, {});
    });

    const result = await fetchSiteEditorContent({ url, token: 'x' }, 'pages/about.json');

    assert.equal(result.outcome, 'ok');
    if (result.outcome === 'ok') {
      assert.equal(result.source, 'draft');
      assert.equal(result.etag, '"draft-etag"');
      assert.equal(new TextDecoder().decode(result.body), JSON.stringify({ title: 'Draft About' }));
    }
    assert.equal(liveWasCalled, false, 'live must never be called when the draft succeeds');
  });

  it('E1: falls back to live when no draft exists (404)', async () => {
    const url = await startServer((req, res) => {
      if (req.url === '/v1/drafts/pages/about.json') {
        sendJson(res, 404, { error: 'not found' });
        return;
      }
      if (req.url === '/v1/content/pages/about.json') {
        sendJson(res, 200, { title: 'Live About' }, '"live-etag"');
        return;
      }
      sendJson(res, 404, {});
    });

    const result = await fetchSiteEditorContent({ url, token: 'x' }, 'pages/about.json');

    assert.equal(result.outcome, 'ok');
    if (result.outcome === 'ok') {
      assert.equal(result.source, 'live');
      assert.equal(result.etag, '"live-etag"');
    }
  });

  it('not-found: neither draft nor live exists', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { error: 'not found' }));

    const result = await fetchSiteEditorContent({ url, token: 'x' }, 'pages/nope.json');
    assert.equal(result.outcome, 'not-found');
  });

  it('unreachable: nothing listening', async () => {
    const result = await fetchSiteEditorContent({ url: 'http://127.0.0.1:1', token: 'x' }, 'pages/about.json');
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the draft call itself is rejected', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));

    const result = await fetchSiteEditorContent({ url, token: 'bad' }, 'pages/about.json');
    assert.equal(result.outcome, 'unauthorized');
  });

  it('unauthorized: draft 404s, then the live call is rejected', async () => {
    const url = await startServer((req, res) => {
      if (req.url === '/v1/drafts/pages/about.json') {
        sendJson(res, 404, {});
        return;
      }
      sendJson(res, 401, { error: 'invalid-token' });
    });

    const result = await fetchSiteEditorContent({ url, token: 'bad' }, 'pages/about.json');
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: a 200 with no ETag header', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, { title: 'no etag' }));

    const result = await fetchSiteEditorContent({ url, token: 'x' }, 'pages/about.json');
    assert.equal(result.outcome, 'error');
  });

  it('error: an unexpected non-2xx, non-404 status from the draft call', async () => {
    const url = await startServer((_req, res) => sendJson(res, 500, { error: 'boom' }));

    const result = await fetchSiteEditorContent({ url, token: 'x' }, 'pages/about.json');
    assert.equal(result.outcome, 'error');
  });
});
