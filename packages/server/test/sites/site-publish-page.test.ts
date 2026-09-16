import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { publishSitePage } from '../../src/sites/site-publish-page.ts';

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

describe('publishSitePage', () => {
  it('POSTs to /v1/publish-page/:path with the stored token', async () => {
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

    const result = await publishSitePage({ url, token: 'my-token' }, 'pages/about.json', 'Putting this live', AUTHOR);

    assert.deepEqual(result, { outcome: 'ok' });
    assert.equal(receivedMethod, 'POST');
    // Never /v1/publish - that one promotes drafts and takes a paths array.
    assert.equal(receivedPath, '/v1/publish-page/pages/about.json');
    assert.equal(receivedAuth, 'Bearer my-token');
    assert.deepEqual(JSON.parse(receivedBody), { message: 'Putting this live', author: AUTHOR });
  });

  it('a 400 is reported as invalid', async () => {
    const url = await startServer((req, res) => sendJson(res, 400, { error: 'bad request' }));

    const result = await publishSitePage({ url, token: 't' }, 'pages/about.json', 'msg', AUTHOR);

    assert.equal(result.outcome, 'invalid');
  });

  it('a 404 is reported as not-found', async () => {
    const url = await startServer((req, res) => sendJson(res, 404, { error: 'not found' }));

    const result = await publishSitePage({ url, token: 't' }, 'pages/about.json', 'msg', AUTHOR);

    assert.equal(result.outcome, 'not-found');
  });

  it("reports a site whose agent has no such route as unsupported, not as a missing page", async () => {
    // Exactly what Fastify answers for an unknown route - what a site
    // still on an older agent actually returns.
    const url = await startServer((req, res) =>
      sendJson(res, 404, {
        message: 'Route POST:/v1/publish-page/pages/about.json not found',
        error: 'Not Found',
        statusCode: 404,
      }),
    );

    const result = await publishSitePage({ url, token: 't' }, 'pages/about.json', 'msg', AUTHOR);

    assert.equal(result.outcome, 'unsupported');
    // The message has to point at the real fix - updating the site -
    // rather than blaming the page, which is what made this confusing.
    assert.match(result.outcome === 'unsupported' ? result.message : '', /update the site/i);
  });

  it('still reports a genuinely missing live page as not-found', async () => {
    // The agent's own page-not-found body names the page, not a route.
    const url = await startServer((req, res) =>
      sendJson(res, 404, {
        message: 'No live page found at "pages/about.json"',
        error: 'Not Found',
        statusCode: 404,
      }),
    );

    const result = await publishSitePage({ url, token: 't' }, 'pages/about.json', 'msg', AUTHOR);

    assert.equal(result.outcome, 'not-found');
  });

  it('unreachable: nothing listening', async () => {
    // Port 1 is privileged and never bound by this suite, so the
    // connection is refused outright rather than timing out.
    const result = await publishSitePage({ url: 'http://127.0.0.1:1', token: 't' }, 'pages/about.json', 'msg', AUTHOR);

    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((req, res) => sendJson(res, 401, { error: 'invalid-token' }));

    const result = await publishSitePage({ url, token: 'stale' }, 'pages/about.json', 'msg', AUTHOR);

    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: an unmapped status', async () => {
    const url = await startServer((req, res) => sendJson(res, 500, { error: 'boom' }));

    const result = await publishSitePage({ url, token: 't' }, 'pages/about.json', 'msg', AUTHOR);

    assert.equal(result.outcome, 'error');
  });
});
