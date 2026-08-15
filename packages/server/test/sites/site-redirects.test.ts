import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  createSiteRedirect,
  deleteSiteRedirect,
  listSiteRedirects,
  updateSiteRedirect,
} from '../../src/sites/site-redirects.ts';

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
const ENTRY = { from: '/old', to: '/new', note: 'moved page' };

describe('listSiteRedirects', () => {
  it('GETs /v1/redirects with the stored token', async () => {
    let receivedMethod = '';
    let receivedPath = '';
    let receivedAuth: string | undefined;
    const url = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedPath = req.url ?? '';
      receivedAuth = req.headers.authorization;
      sendJson(res, 200, { schemaVersion: 1, entries: [ENTRY] });
    });

    const result = await listSiteRedirects({ url, token: 'my-token' });

    assert.deepEqual(result, { outcome: 'ok', entries: [ENTRY] });
    assert.equal(receivedMethod, 'GET');
    assert.equal(receivedPath, '/v1/redirects');
    assert.equal(receivedAuth, 'Bearer my-token');
  });

  it('unreachable: nothing listening', async () => {
    const result = await listSiteRedirects({ url: 'http://127.0.0.1:1', token: 'x' });
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));
    const result = await listSiteRedirects({ url, token: 'bad' });
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: a 200 with a malformed body, never a crash', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, { entries: 'not an array' }));
    const result = await listSiteRedirects({ url, token: 'x' });
    assert.equal(result.outcome, 'error');
  });
});

describe('createSiteRedirect', () => {
  it('POSTs /v1/redirects with from/to/note/message/author, returning the entry and any retargeted entries', async () => {
    let receivedMethod = '';
    let receivedBody = '';
    const url = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      readBody(req).then((body) => {
        receivedBody = body;
        sendJson(res, 200, { entry: ENTRY, retargeted: [] });
      });
    });

    const result = await createSiteRedirect({ url, token: 'my-token' }, '/old', '/new', 'moved page', 'Add redirect', AUTHOR);

    assert.deepEqual(result, { outcome: 'ok', entry: ENTRY, retargeted: [] });
    assert.equal(receivedMethod, 'POST');
    assert.deepEqual(JSON.parse(receivedBody), {
      from: '/old',
      to: '/new',
      note: 'moved page',
      message: 'Add redirect',
      author: AUTHOR,
    });
  });

  it('400: reported as invalid', async () => {
    const url = await startServer((_req, res) => sendJson(res, 400, { message: 'That redirect would create a cycle' }));
    const result = await createSiteRedirect({ url, token: 'x' }, '/a', '/a', undefined, 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'invalid', message: 'That redirect would create a cycle' });
  });

  it('409: reported as conflict', async () => {
    const url = await startServer((_req, res) => sendJson(res, 409, { message: 'A redirect from that path already exists' }));
    const result = await createSiteRedirect({ url, token: 'x' }, '/old', '/new', undefined, 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'conflict', message: 'A redirect from that path already exists' });
  });

  it('unreachable: nothing listening', async () => {
    const result = await createSiteRedirect({ url: 'http://127.0.0.1:1', token: 'x' }, '/old', '/new', undefined, 'msg', AUTHOR);
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));
    const result = await createSiteRedirect({ url, token: 'bad' }, '/old', '/new', undefined, 'msg', AUTHOR);
    assert.equal(result.outcome, 'unauthorized');
  });
});

describe('updateSiteRedirect', () => {
  it('PUTs /v1/redirects, matching the existing entry by from', async () => {
    let receivedMethod = '';
    const url = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      sendJson(res, 200, { entry: { from: '/old', to: '/newer' }, retargeted: [] });
    });

    const result = await updateSiteRedirect({ url, token: 'x' }, '/old', '/newer', undefined, 'Update redirect', AUTHOR);

    assert.equal(receivedMethod, 'PUT');
    assert.deepEqual(result, { outcome: 'ok', entry: { from: '/old', to: '/newer' }, retargeted: [] });
  });

  it('404: reported as not-found', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { message: 'No redirect found at that path' }));
    const result = await updateSiteRedirect({ url, token: 'x' }, '/gone', '/new', undefined, 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'not-found', message: 'No redirect found at that path' });
  });
});

describe('deleteSiteRedirect', () => {
  it('DELETEs /v1/redirects with from/message/author in the body', async () => {
    let receivedMethod = '';
    let receivedBody = '';
    const url = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      readBody(req).then((body) => {
        receivedBody = body;
        res.writeHead(204);
        res.end();
      });
    });

    const result = await deleteSiteRedirect({ url, token: 'x' }, '/old', 'Remove redirect', AUTHOR);

    assert.deepEqual(result, { outcome: 'ok' });
    assert.equal(receivedMethod, 'DELETE');
    assert.deepEqual(JSON.parse(receivedBody), { from: '/old', message: 'Remove redirect', author: AUTHOR });
  });

  it('404: reported as not-found', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { message: 'No redirect found at that path' }));
    const result = await deleteSiteRedirect({ url, token: 'x' }, '/gone', 'msg', AUTHOR);
    assert.deepEqual(result, { outcome: 'not-found', message: 'No redirect found at that path' });
  });

  it('unreachable: nothing listening', async () => {
    const result = await deleteSiteRedirect({ url: 'http://127.0.0.1:1', token: 'x' }, '/old', 'msg', AUTHOR);
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));
    const result = await deleteSiteRedirect({ url, token: 'bad' }, '/old', 'msg', AUTHOR);
    assert.equal(result.outcome, 'unauthorized');
  });
});
