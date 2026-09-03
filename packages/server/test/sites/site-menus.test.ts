import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { saveSiteMenu } from '../../src/sites/site-menus.ts';

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

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
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
const CONTENT = { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] };

describe('saveSiteMenu', () => {
  it('PUTs /v1/menus/<path with menus/ stripped>, with If-Match/content/message/author', async () => {
    let receivedMethod = '';
    let receivedPath = '';
    let receivedAuth: string | undefined;
    let receivedIfMatch: string | undefined;
    let receivedBody = '';
    const url = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedPath = req.url ?? '';
      receivedAuth = req.headers.authorization;
      receivedIfMatch = req.headers['if-match'] as string | undefined;
      readBody(req).then((body) => {
        receivedBody = body;
        sendJson(res, 200, { ok: true }, { etag: '"new-etag"' });
      });
    });

    const result = await saveSiteMenu({ url, token: 'my-token' }, 'menus/main.json', CONTENT, '"old-etag"', 'Update menu items', AUTHOR);

    assert.deepEqual(result, { outcome: 'ok', etag: '"new-etag"' });
    assert.equal(receivedMethod, 'PUT');
    assert.equal(receivedPath, '/v1/menus/main.json');
    assert.equal(receivedAuth, 'Bearer my-token');
    assert.equal(receivedIfMatch, '"old-etag"');
    assert.deepEqual(JSON.parse(receivedBody), { content: CONTENT, message: 'Update menu items', author: AUTHOR });
  });

  it('strips a nested menus/ prefix, not just the leading segment', async () => {
    let receivedPath = '';
    const url = await startServer((req, res) => {
      receivedPath = req.url ?? '';
      sendJson(res, 200, { ok: true }, { etag: '"x"' });
    });

    await saveSiteMenu({ url, token: 'x' }, 'menus/footer/company.json', CONTENT, '"etag"', 'msg', AUTHOR);

    assert.equal(receivedPath, '/v1/menus/footer/company.json');
  });

  it('404: reported as not-found', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { message: 'No menu found at that path' }));
    const result = await saveSiteMenu({ url, token: 'x' }, 'menus/gone.json', CONTENT, '"etag"', 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'not-found', message: 'No menu found at that path' });
  });

  it('409: reported as conflict', async () => {
    const url = await startServer((_req, res) => sendJson(res, 409, { message: 'This menu changed since you opened it' }));
    const result = await saveSiteMenu({ url, token: 'x' }, 'menus/main.json', CONTENT, '"stale-etag"', 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'conflict', message: 'This menu changed since you opened it' });
  });

  it('400: reported as invalid', async () => {
    const url = await startServer((_req, res) => sendJson(res, 400, { message: 'The site rejected this menu as invalid' }));
    const result = await saveSiteMenu({ url, token: 'x' }, 'menus/main.json', CONTENT, '"etag"', 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'invalid', message: 'The site rejected this menu as invalid' });
  });

  it('unreachable: nothing listening', async () => {
    const result = await saveSiteMenu({ url: 'http://127.0.0.1:1', token: 'x' }, 'menus/main.json', CONTENT, '"etag"', 'msg', AUTHOR);
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));
    const result = await saveSiteMenu({ url, token: 'bad' }, 'menus/main.json', CONTENT, '"etag"', 'msg', AUTHOR);
    assert.equal(result.outcome, 'unauthorized');
  });

  it('200 with no etag header: reported as error, never silently ok', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, { ok: true }));
    const result = await saveSiteMenu({ url, token: 'x' }, 'menus/main.json', CONTENT, '"etag"', 'msg', AUTHOR);
    assert.equal(result.outcome, 'error');
  });
});
