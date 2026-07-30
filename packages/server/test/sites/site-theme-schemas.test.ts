import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSiteThemeSchemas } from '../../src/sites/site-theme-schemas.ts';

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

const SCHEMAS = {
  sections: { hero: { type: 'object', required: ['heading'], properties: { heading: { type: 'string' } } } },
  blocks: { button: { type: 'object', required: ['label'], properties: { label: { type: 'string' } } } },
  acceptsBlocks: { sections: { hero: true }, blocks: { button: false } },
};

describe('fetchSiteThemeSchemas', () => {
  it('I2: GETs /v1/theme/schemas with the stored token', async () => {
    let receivedPath = '';
    let receivedAuth: string | undefined;
    const url = await startServer((req, res) => {
      receivedPath = req.url ?? '';
      receivedAuth = req.headers.authorization;
      sendJson(res, 200, SCHEMAS);
    });

    const result = await fetchSiteThemeSchemas({ url, token: 'my-token' });

    assert.deepEqual(result, { outcome: 'ok', schemas: SCHEMAS });
    assert.equal(receivedPath, '/v1/theme/schemas');
    assert.equal(receivedAuth, 'Bearer my-token');
  });

  it('unreachable: nothing listening', async () => {
    const result = await fetchSiteThemeSchemas({ url: 'http://127.0.0.1:1', token: 'x' });
    assert.equal(result.outcome, 'unreachable');
  });

  it('unauthorized: the site rejects the token', async () => {
    const url = await startServer((_req, res) => sendJson(res, 401, { error: 'invalid-token' }));

    const result = await fetchSiteThemeSchemas({ url, token: 'bad' });
    assert.equal(result.outcome, 'unauthorized');
  });

  it('error: an unmapped status', async () => {
    const url = await startServer((_req, res) => sendJson(res, 500, { error: 'boom' }));

    const result = await fetchSiteThemeSchemas({ url, token: 'x' });
    assert.equal(result.outcome, 'error');
  });

  it('error: a 200 with a malformed body, never a crash', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, { sections: 'not an object' }));

    const result = await fetchSiteThemeSchemas({ url, token: 'x' });
    assert.equal(result.outcome, 'error');
  });

  it('error: a 200 missing acceptsBlocks entirely', async () => {
    const url = await startServer((_req, res) => sendJson(res, 200, { sections: {}, blocks: {} }));

    const result = await fetchSiteThemeSchemas({ url, token: 'x' });
    assert.equal(result.outcome, 'error');
  });

  it('error: a 200 with non-JSON body', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('not json');
    });

    const result = await fetchSiteThemeSchemas({ url, token: 'x' });
    assert.equal(result.outcome, 'error');
  });
});
