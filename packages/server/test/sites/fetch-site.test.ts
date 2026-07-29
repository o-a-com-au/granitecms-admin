import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSite } from '../../src/sites/fetch-site.ts';

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

describe('fetchSite', () => {
  it('returns a real response on success', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello');
    });

    const result = await fetchSite({ url }, '/v1/whatever');
    assert.equal(result.outcome, 'response');
    if (result.outcome === 'response') {
      assert.equal(await result.response.text(), 'hello');
    }
  });

  it('returns unreachable when nothing is listening', async () => {
    const result = await fetchSite({ url: 'http://127.0.0.1:1' }, '/v1/whatever');
    assert.equal(result.outcome, 'unreachable');
  });

  it('returns unreachable on a genuine timeout', async () => {
    const url = await startServer((_req, res) => {
      setTimeout(() => res.end('too late'), 300);
    });

    const result = await fetchSite({ url }, '/v1/whatever', { timeoutMs: 50 });
    assert.equal(result.outcome, 'unreachable');
  });

  it('sends no Authorization header when authToken is omitted', async () => {
    const url = await startServer((req, res) => {
      res.end(JSON.stringify({ authorization: req.headers.authorization ?? null }));
    });

    const result = await fetchSite({ url }, '/v1/whatever');
    assert.equal(result.outcome, 'response');
    if (result.outcome === 'response') {
      assert.deepEqual(await result.response.json(), { authorization: null });
    }
  });

  it('sends a Bearer Authorization header when authToken is provided', async () => {
    const url = await startServer((req, res) => {
      res.end(JSON.stringify({ authorization: req.headers.authorization ?? null }));
    });

    const result = await fetchSite({ url }, '/v1/whatever', { authToken: 'my-token' });
    assert.equal(result.outcome, 'response');
    if (result.outcome === 'response') {
      assert.deepEqual(await result.response.json(), { authorization: 'Bearer my-token' });
    }
  });

  it('builds the request URL via new URL(path, site.url), joining a relative path correctly', async () => {
    const url = await startServer((req, res) => {
      res.end(JSON.stringify({ url: req.url }));
    });

    const result = await fetchSite({ url }, '/v1/content?type=page');
    assert.equal(result.outcome, 'response');
    if (result.outcome === 'response') {
      assert.deepEqual(await result.response.json(), { url: '/v1/content?type=page' });
    }
  });
});
