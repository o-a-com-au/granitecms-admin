import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { reindexSite } from '../../src/sites/site-search.ts';

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

describe('reindexSite', () => {
  it('POSTs to /v1/search/rebuild with the stored token and no body', async () => {
    let receivedMethod = '';
    let receivedPath = '';
    let receivedAuth: string | undefined;
    let receivedBody = '';
    const url = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedPath = req.url ?? '';
      receivedAuth = req.headers.authorization;
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      req.on('end', () => {
        receivedBody = raw;
        sendJson(res, 200, { ok: true });
      });
    });

    const result = await reindexSite({ url, token: 'my-token' });

    assert.deepEqual(result, { outcome: 'ok' });
    assert.equal(receivedMethod, 'POST');
    assert.equal(receivedPath, '/v1/search/rebuild');
    assert.equal(receivedAuth, 'Bearer my-token');
    assert.equal(receivedBody, '');
  });

  it('unreachable: nothing listening', async () => {
    const result = await reindexSite({ url: 'http://127.0.0.1:1', token: 'x' });
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));

    const result = await reindexSite({ url, token: 'bad' });
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: an unmapped status', async () => {
    const url = await startServer((_req, res) => sendJson(res, 500, { error: 'boom' }));

    const result = await reindexSite({ url, token: 'x' });
    assert.equal(result.outcome, 'error');
  });
});
