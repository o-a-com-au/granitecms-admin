import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSite } from '../../src/sites/fetch-site.ts';
import { interpretSiteResponse } from '../../src/sites/interpret-site-response.ts';

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

describe('interpretSiteResponse', () => {
  it('unreachable passes through unchanged', async () => {
    const result = await fetchSite({ url: 'http://127.0.0.1:1' }, '/v1/whatever');
    const interpreted = await interpretSiteResponse(result);
    assert.deepEqual(interpreted, { outcome: 'unreachable' });
  });

  it('a 401 is remapped to unauthorized, not forwarded', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid-token' }));
    });

    const result = await fetchSite({ url }, '/v1/whatever');
    const interpreted = await interpretSiteResponse(result);
    assert.deepEqual(interpreted, { outcome: 'unauthorized' });
  });

  it('a 403 is remapped to unauthorized the same as a 401', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing-scope' }));
    });

    const result = await fetchSite({ url }, '/v1/whatever');
    const interpreted = await interpretSiteResponse(result);
    assert.deepEqual(interpreted, { outcome: 'unauthorized' });
  });

  it('everything else forwards verbatim, including a quoted etag exactly as sent', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', etag: '"abc123def"' });
      res.end('{"hello":"world"}');
    });

    const result = await fetchSite({ url }, '/v1/whatever');
    const interpreted = await interpretSiteResponse(result);

    assert.equal(interpreted.outcome, 'forwarded');
    if (interpreted.outcome === 'forwarded') {
      assert.equal(interpreted.status, 200);
      assert.equal(interpreted.etag, '"abc123def"');
      assert.equal(new TextDecoder().decode(interpreted.body), '{"hello":"world"}');
    }
  });

  it('forwards a 409 with a null etag when the site sets none', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 409, error: 'Conflict', message: 'stale' }));
    });

    const result = await fetchSite({ url }, '/v1/whatever');
    const interpreted = await interpretSiteResponse(result);

    assert.equal(interpreted.outcome, 'forwarded');
    if (interpreted.outcome === 'forwarded') {
      assert.equal(interpreted.status, 409);
      assert.equal(interpreted.etag, null);
    }
  });

  it('forwards a 404', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ statusCode: 404, error: 'Not Found', message: 'no draft' }));
    });

    const result = await fetchSite({ url }, '/v1/whatever');
    const interpreted = await interpretSiteResponse(result);

    assert.equal(interpreted.outcome, 'forwarded');
    if (interpreted.outcome === 'forwarded') {
      assert.equal(interpreted.status, 404);
    }
  });
});
