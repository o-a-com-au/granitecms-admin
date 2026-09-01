import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { moveSitePath } from '../../src/sites/site-move.ts';

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

const AUTHOR = { name: 'Jane Editor', email: 'jane@example.com' };

describe('moveSitePath', () => {
  it('POSTs /v1/content/move with the page URLs (not content-relative paths), the stored token, and createRedirect: false', async () => {
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

    const result = await moveSitePath({ url, token: 'my-token' }, '/about', '/company', 'Rename slug', AUTHOR);

    assert.deepEqual(result, { outcome: 'ok' });
    assert.equal(receivedMethod, 'POST');
    assert.equal(receivedPath, '/v1/content/move');
    assert.equal(receivedAuth, 'Bearer my-token');
    assert.deepEqual(JSON.parse(receivedBody), {
      from: '/about',
      to: '/company',
      message: 'Rename slug',
      author: AUTHOR,
      createRedirect: false,
    });
  });

  it('createRedirect: true is passed through to the agent when the caller explicitly requests it (the page tree\'s drag-to-reparent feature)', async () => {
    let receivedBody = '';
    const url = await startServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      req.on('end', () => {
        receivedBody = raw;
        sendJson(res, 200, { ok: true });
      });
    });

    const result = await moveSitePath({ url, token: 'my-token' }, '/team', '/about/team', 'Move team under About', AUTHOR, {
      createRedirect: true,
    });

    assert.deepEqual(result, { outcome: 'ok' });
    assert.equal(JSON.parse(receivedBody).createRedirect, true);
  });

  it('a 404 is reported as source-not-found', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { statusCode: 404, error: 'Not Found' }));

    const result = await moveSitePath({ url, token: 'x' }, '/never-existed', '/somewhere', 'msg', AUTHOR);
    assert.equal(result.outcome, 'source-not-found');
  });

  it('a 409 is reported as destination-exists', async () => {
    const url = await startServer((_req, res) => sendJson(res, 409, { statusCode: 409, error: 'Conflict' }));

    const result = await moveSitePath({ url, token: 'x' }, '/about', '/company', 'msg', AUTHOR);
    assert.equal(result.outcome, 'destination-exists');
  });

  it('unreachable: nothing listening', async () => {
    const result = await moveSitePath({ url: 'http://127.0.0.1:1', token: 'x' }, '/about', '/company', 'msg', AUTHOR);
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));

    const result = await moveSitePath({ url, token: 'bad' }, '/about', '/company', 'msg', AUTHOR);
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: an unmapped status', async () => {
    const url = await startServer((_req, res) => sendJson(res, 500, { error: 'boom' }));

    const result = await moveSitePath({ url, token: 'x' }, '/about', '/company', 'msg', AUTHOR);
    assert.equal(result.outcome, 'error');
  });
});
