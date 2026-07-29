import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { checkSiteStatus } from '../../src/sites/site-status.ts';

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

describe('checkSiteStatus', () => {
  it('ok: a real cms-agent site with a valid token', async () => {
    const url = await startServer((req, res) => {
      if (req.url === '/v1/capabilities') {
        sendJson(res, 200, { agentVersion: '1.2.3', contentSchemaVersion: 4, sqliteDriver: 'node:sqlite' });
        return;
      }
      if (req.url === '/v1/content') {
        sendJson(res, 200, []);
        return;
      }
      sendJson(res, 404, { error: 'not found' });
    });

    const status = await checkSiteStatus({ url, token: 'a-real-token' });
    assert.deepEqual(status, {
      state: 'ok',
      agentVersion: '1.2.3',
      contentSchemaVersion: 4,
      sqliteDriver: 'node:sqlite',
    });
  });

  it('unreachable: nothing is listening at the given URL', async () => {
    const status = await checkSiteStatus({ url: 'http://127.0.0.1:1', token: 'irrelevant' });
    assert.equal(status.state, 'unreachable');
  });

  it('unreachable: the site does not respond within the timeout', async () => {
    const url = await startServer((_req, res) => {
      setTimeout(() => sendJson(res, 200, { agentVersion: '1', contentSchemaVersion: 1, sqliteDriver: 'x' }), 300);
    });

    const status = await checkSiteStatus({ url, token: 'irrelevant' }, { timeoutMs: 50 });
    assert.equal(status.state, 'unreachable');
  });

  it('unauthorized: capabilities succeeds but the stored token is rejected by /v1/content', async () => {
    const url = await startServer((req, res) => {
      if (req.url === '/v1/capabilities') {
        sendJson(res, 200, { agentVersion: '1.2.3', contentSchemaVersion: 4, sqliteDriver: 'node:sqlite' });
        return;
      }
      sendJson(res, 401, { error: 'invalid-token' });
    });

    const status = await checkSiteStatus({ url, token: 'a-bad-token' });
    assert.equal(status.state, 'unauthorized');
  });

  it('unauthorized: a 403 (wrong scope) is treated the same as a 401', async () => {
    const url = await startServer((req, res) => {
      if (req.url === '/v1/capabilities') {
        sendJson(res, 200, { agentVersion: '1.2.3', contentSchemaVersion: 4, sqliteDriver: 'node:sqlite' });
        return;
      }
      sendJson(res, 403, { error: 'missing-scope' });
    });

    const status = await checkSiteStatus({ url, token: 'wrong-scope-token' });
    assert.equal(status.state, 'unauthorized');
  });

  it('error: capabilities responds but the body is not shaped like a cms-agent capabilities response', async () => {
    const url = await startServer((_req, res) => {
      sendJson(res, 200, { hello: 'world' });
    });

    const status = await checkSiteStatus({ url, token: 'irrelevant' });
    assert.equal(status.state, 'error');
  });

  it('error: capabilities responds with a non-2xx status', async () => {
    const url = await startServer((_req, res) => {
      sendJson(res, 500, { error: 'boom' });
    });

    const status = await checkSiteStatus({ url, token: 'irrelevant' });
    assert.equal(status.state, 'error');
  });

  it('never crashes on a genuinely malformed capabilities response body', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('not json at all {{{');
    });

    const status = await checkSiteStatus({ url, token: 'irrelevant' });
    assert.equal(status.state, 'error');
  });
});
