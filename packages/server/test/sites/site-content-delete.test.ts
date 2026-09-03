import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { deleteSiteContent } from '../../src/sites/site-content-delete.ts';

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

async function readBody(req: IncomingMessage): Promise<string> {
  let raw = '';
  for await (const chunk of req) {
    raw += (chunk as Buffer).toString();
  }
  return raw;
}

const AUTHOR = { name: 'Jane Editor', email: 'jane@example.com' };

describe('deleteSiteContent', () => {
  it('DELETEs /v1/content/<content-relative path> with the stored token and message/author', async () => {
    let receivedMethod = '';
    let receivedPath = '';
    let receivedAuth: string | undefined;
    let receivedBody = '';
    const url = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedPath = req.url ?? '';
      receivedAuth = req.headers.authorization;
      readBody(req).then((body) => {
        receivedBody = body;
        res.writeHead(204);
        res.end();
      });
    });

    const result = await deleteSiteContent({ url, token: 'my-token' }, 'pages/about.json', 'Delete About', AUTHOR);

    assert.deepEqual(result, { outcome: 'ok' });
    assert.equal(receivedMethod, 'DELETE');
    assert.equal(receivedPath, '/v1/content/pages/about.json');
    assert.equal(receivedAuth, 'Bearer my-token');
    assert.deepEqual(JSON.parse(receivedBody), { message: 'Delete About', author: AUTHOR });
  });

  it('404: reported as not-found', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { message: 'No page found at that path' }));
    const result = await deleteSiteContent({ url, token: 'x' }, 'pages/gone.json', 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'not-found', message: 'No page found at that path' });
  });

  it('409: reported as has-children, with the agent\'s own message', async () => {
    const url = await startServer((_req, res) => sendJson(res, 409, { message: '"pages/about.json" has child pages; delete them first' }));
    const result = await deleteSiteContent({ url, token: 'x' }, 'pages/about.json', 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'has-children', message: '"pages/about.json" has child pages; delete them first' });
  });

  it('400: reported as invalid', async () => {
    const url = await startServer((_req, res) => sendJson(res, 400, { message: 'That delete request is not valid' }));
    const result = await deleteSiteContent({ url, token: 'x' }, 'pages/about.json', 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'invalid', message: 'That delete request is not valid' });
  });

  it('unreachable: nothing listening', async () => {
    const result = await deleteSiteContent({ url: 'http://127.0.0.1:1', token: 'x' }, 'pages/about.json', 'msg', AUTHOR);
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));
    const result = await deleteSiteContent({ url, token: 'bad' }, 'pages/about.json', 'msg', AUTHOR);
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: an unmapped status', async () => {
    const url = await startServer((_req, res) => sendJson(res, 500, { error: 'boom' }));
    const result = await deleteSiteContent({ url, token: 'x' }, 'pages/about.json', 'msg', AUTHOR);
    assert.equal(result.outcome, 'error');
  });
});
