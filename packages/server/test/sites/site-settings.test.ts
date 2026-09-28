import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fetchSiteSettings, saveSiteSettings } from '../../src/sites/site-settings.ts';

let server: Server | undefined;

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
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

const AUTHOR = { name: 'Jane Editor', email: 'jane@example.com' };
const SCHEMA = { type: 'object', properties: { instagram_url: { type: 'string' } } };

describe('fetchSiteSettings', () => {
  it('returns the schema, saved and resolved values, and the ETag', async () => {
    let auth: string | undefined;
    const url = await startServer((req, res) => {
      auth = req.headers.authorization;
      sendJson(res, 200, { schema: SCHEMA, settings: { instagram_url: 'x' }, resolved: { instagram_url: 'x' } }, { etag: '"s1"' });
    });
    const result = await fetchSiteSettings({ url, token: 'the-token' });
    assert.deepEqual(result, {
      outcome: 'ok',
      payload: { schema: SCHEMA, settings: { instagram_url: 'x' }, resolved: { instagram_url: 'x' }, etag: '"s1"' },
    });
    assert.equal(auth, 'Bearer the-token');
  });

  it('reports a site whose CMS predates site settings (404) as unsupported, not as an error', async () => {
    const url = await startServer((_req, res) => sendJson(res, 404, { message: 'Not Found' }));
    assert.equal((await fetchSiteSettings({ url, token: 't' })).outcome, 'unsupported');
  });
});

describe('saveSiteSettings', () => {
  it('PUTs the settings with If-Match, message and author, returning the new ETag', async () => {
    let received: { method?: string; ifMatch?: string; body?: unknown } = {};
    const url = await startServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        received = { method: req.method, ifMatch: req.headers['if-match'] as string, body: JSON.parse(raw) };
        res.writeHead(200, { etag: '"s2"' });
        res.end('{"ok":true}');
      });
    });
    const result = await saveSiteSettings({ url, token: 't' }, { instagram_url: 'y' }, '"s1"', 'Update site settings', AUTHOR);
    assert.deepEqual(result, { outcome: 'ok', etag: '"s2"' });
    assert.deepEqual(received, {
      method: 'PUT',
      ifMatch: '"s1"',
      body: { settings: { instagram_url: 'y' }, message: 'Update site settings', author: AUTHOR },
    });
  });

  it('maps 409 to a conflict and 400 to invalid, keeping the site\'s own per-field errors', async () => {
    let url = await startServer((_req, res) => sendJson(res, 409, { message: 'changed since you opened them' }));
    assert.deepEqual(await saveSiteSettings({ url, token: 't' }, {}, '"x"', 'm', AUTHOR), {
      outcome: 'conflict',
      message: 'changed since you opened them',
    });
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;

    url = await startServer((_req, res) =>
      sendJson(res, 400, { message: 'Site settings failed validation', errors: [{ path: '/body_font', message: 'must be equal to one of the allowed values' }] }),
    );
    assert.deepEqual(await saveSiteSettings({ url, token: 't' }, {}, '"x"', 'm', AUTHOR), {
      outcome: 'invalid',
      message: 'Site settings failed validation',
      errors: [{ path: '/body_font', message: 'must be equal to one of the allowed values' }],
    });
  });
});
