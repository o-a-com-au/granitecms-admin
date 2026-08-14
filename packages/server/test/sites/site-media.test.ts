import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { deleteSiteMedia, listSiteMedia, uploadSiteMedia } from '../../src/sites/site-media.ts';

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

const MEDIA_LIST = [
  { name: 'abc-photo.jpg', size: 5, mtimeMs: 123, url: '/media/abc-photo.jpg' },
];

describe('listSiteMedia', () => {
  it('fetches capabilities then media, rewriting each entry\'s url absolute against the site\'s own origin', async () => {
    const requestedPaths: string[] = [];
    const url = await startServer((req, res) => {
      requestedPaths.push(req.url ?? '');
      if (req.url === '/v1/capabilities') {
        sendJson(res, 200, { agentVersion: '1.0.0', maxMediaUploadBytes: 12345 });
        return;
      }
      sendJson(res, 200, MEDIA_LIST);
    });

    const result = await listSiteMedia({ url, token: 'my-token' });

    assert.deepEqual(requestedPaths, ['/v1/capabilities', '/v1/media']);
    assert.deepEqual(result, {
      outcome: 'ok',
      items: [{ name: 'abc-photo.jpg', size: 5, mtimeMs: 123, url: `${url}/media/abc-photo.jpg` }],
      maxUploadBytes: 12345,
    });
  });

  it('falls back to the sentinel maxUploadBytes when capabilities fails, without failing the whole list', async () => {
    const url = await startServer((req, res) => {
      if (req.url === '/v1/capabilities') {
        res.writeHead(500);
        res.end('boom');
        return;
      }
      sendJson(res, 200, MEDIA_LIST);
    });

    const result = await listSiteMedia({ url, token: 'my-token' });

    assert.equal(result.outcome, 'ok');
    assert.equal(result.outcome === 'ok' && result.maxUploadBytes, 20 * 1024 * 1024);
  });

  it('falls back to the sentinel maxUploadBytes when capabilities returns a malformed body', async () => {
    const url = await startServer((req, res) => {
      if (req.url === '/v1/capabilities') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('not json');
        return;
      }
      sendJson(res, 200, MEDIA_LIST);
    });

    const result = await listSiteMedia({ url, token: 'my-token' });

    assert.equal(result.outcome === 'ok' && result.maxUploadBytes, 20 * 1024 * 1024);
  });

  it('unreachable: nothing listening', async () => {
    const result = await listSiteMedia({ url: 'http://127.0.0.1:1', token: 'x' });
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token on /v1/media', async () => {
    const url = await startServer((req, res) => {
      if (req.url === '/v1/capabilities') {
        sendJson(res, 200, { maxMediaUploadBytes: 1000 });
        return;
      }
      sendJson(res, 401, { error: 'invalid-token' });
    });

    const result = await listSiteMedia({ url, token: 'bad' });
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: a 200 with a malformed media list body, never a crash', async () => {
    const url = await startServer((req, res) => {
      if (req.url === '/v1/capabilities') {
        sendJson(res, 200, { maxMediaUploadBytes: 1000 });
        return;
      }
      sendJson(res, 200, { not: 'an array' });
    });

    const result = await listSiteMedia({ url, token: 'x' });
    assert.equal(result.outcome, 'error');
  });
});

describe('uploadSiteMedia', () => {
  it('POSTs a real multipart body with the stored token, no manual Content-Type override', async () => {
    let receivedAuth: string | undefined;
    let receivedContentType: string | undefined;
    let receivedBody = Buffer.alloc(0);
    const url = await startServer((req, res) => {
      receivedAuth = req.headers.authorization;
      receivedContentType = req.headers['content-type'];
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks);
        sendJson(res, 201, { name: 'abc-photo.jpg', size: 5, url: '/media/abc-photo.jpg' });
      });
    });

    const result = await uploadSiteMedia({ url, token: 'my-token' }, 'photo.jpg', Buffer.from('hello'));

    assert.equal(receivedAuth, 'Bearer my-token');
    assert.match(receivedContentType ?? '', /^multipart\/form-data; boundary=/);
    assert.ok(receivedBody.toString('utf-8').includes('photo.jpg'));
    assert.ok(receivedBody.toString('utf-8').includes('hello'));
    assert.deepEqual(result, { outcome: 'ok', name: 'abc-photo.jpg', size: 5, url: `${url}/media/abc-photo.jpg` });
  });

  it('415: unsupported-type', async () => {
    const url = await startServer((_req, res) => sendJson(res, 415, { error: 'bad type' }));
    const result = await uploadSiteMedia({ url, token: 'x' }, 'icon.svg', Buffer.from('x'));
    assert.equal(result.outcome, 'unsupported-type');
  });

  it('413: too-large', async () => {
    const url = await startServer((_req, res) => sendJson(res, 413, { error: 'too big' }));
    const result = await uploadSiteMedia({ url, token: 'x' }, 'photo.jpg', Buffer.from('x'));
    assert.equal(result.outcome, 'too-large');
  });

  it('unreachable: nothing listening', async () => {
    const result = await uploadSiteMedia({ url: 'http://127.0.0.1:1', token: 'x' }, 'photo.jpg', Buffer.from('x'));
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));
    const result = await uploadSiteMedia({ url, token: 'bad' }, 'photo.jpg', Buffer.from('x'));
    assert.equal(result.outcome, 'unauthorized');
  });
});

describe('deleteSiteMedia', () => {
  it('DELETEs /v1/media/:name with the stored token', async () => {
    let receivedMethod = '';
    let receivedPath = '';
    const url = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedPath = req.url ?? '';
      res.writeHead(204);
      res.end();
    });

    const result = await deleteSiteMedia({ url, token: 'my-token' }, 'abc-photo.jpg');

    assert.equal(receivedMethod, 'DELETE');
    assert.equal(receivedPath, '/v1/media/abc-photo.jpg');
    assert.deepEqual(result, { outcome: 'ok' });
  });

  it('not-found: the site reports 404', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { error: 'not found' }));
    const result = await deleteSiteMedia({ url, token: 'x' }, 'missing.jpg');
    assert.equal(result.outcome, 'not-found');
  });

  it('unreachable: nothing listening', async () => {
    const result = await deleteSiteMedia({ url: 'http://127.0.0.1:1', token: 'x' }, 'photo.jpg');
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));
    const result = await deleteSiteMedia({ url, token: 'bad' }, 'photo.jpg');
    assert.equal(result.outcome, 'unauthorized');
  });
});
