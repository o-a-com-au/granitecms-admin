import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { saveSiteDraft } from '../../src/sites/site-draft-save.ts';

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

describe('saveSiteDraft', () => {
  it('E2, E3: PUTs with the given If-Match and the stored token, returning the new ETag on success', async () => {
    let receivedMethod = '';
    let receivedIfMatch: string | undefined;
    let receivedAuth: string | undefined;
    let receivedBody = '';
    const url = await startServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedIfMatch = req.headers['if-match'] as string | undefined;
      receivedAuth = req.headers.authorization;
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      req.on('end', () => {
        receivedBody = raw;
        sendJson(res, 200, { ok: true }, '"new-etag"');
      });
    });

    const result = await saveSiteDraft({ url, token: 'my-token' }, 'pages/about.json', '{"title":"hi"}', '"old-etag"');

    assert.deepEqual(result, { outcome: 'ok', etag: '"new-etag"' });
    assert.equal(receivedMethod, 'PUT');
    assert.equal(receivedIfMatch, '"old-etag"');
    assert.equal(receivedAuth, 'Bearer my-token');
    assert.equal(receivedBody, '{"title":"hi"}');
  });

  it('E4: a 409 is reported as a conflict, not a generic error', async () => {
    const url = await startServer((_req, res) =>
      sendJson(res, 409, { statusCode: 409, error: 'Conflict', message: 'stale' }),
    );

    const result = await saveSiteDraft({ url, token: 'x' }, 'pages/about.json', '{}', '"stale-etag"');
    assert.equal(result.outcome, 'conflict');
  });

  it('a 400 is reported as invalid content', async () => {
    const url = await startServer((_req, res) =>
      sendJson(res, 400, { statusCode: 400, error: 'Bad Request', message: 'bad content' }),
    );

    const result = await saveSiteDraft({ url, token: 'x' }, 'pages/about.json', '{}', '"etag"');
    assert.equal(result.outcome, 'invalid');
  });

  it('unreachable: nothing listening', async () => {
    const result = await saveSiteDraft({ url: 'http://127.0.0.1:1', token: 'x' }, 'pages/about.json', '{}', '"etag"');
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));

    const result = await saveSiteDraft({ url, token: 'bad' }, 'pages/about.json', '{}', '"etag"');
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: a 200 with no new ETag header', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, { ok: true }));

    const result = await saveSiteDraft({ url, token: 'x' }, 'pages/about.json', '{}', '"etag"');
    assert.equal(result.outcome, 'error');
  });
});
