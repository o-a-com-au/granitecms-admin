import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/server.ts';
import type { AdminConfig } from '../src/config.ts';

describe('server', () => {
  it('A2: GET /api/health returns ok', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });

    await app.close();
  });
});

describe('server - production static/SPA serving', () => {
  let webDistDir: string;
  let config: AdminConfig;

  beforeEach(async () => {
    webDistDir = await mkdtemp(join(tmpdir(), 'admin-web-dist-'));
    await writeFile(join(webDistDir, 'index.html'), '<html><body>admin shell</body></html>');
    await writeFile(join(webDistDir, 'app.js'), 'console.log("asset");');
    config = {
      port: 0,
      dataDir: join(webDistDir, 'data'),
      webDistDir,
      baseUrl: 'http://localhost:0',
      googleOAuth: undefined,
      githubOAuth: undefined,
    };
  });

  afterEach(async () => {
    await rm(webDistDir, { recursive: true, force: true });
  });

  it('serves a real static asset from the built web dist', async () => {
    const app = await buildServer(config);
    const response = await app.inject({ method: 'GET', url: '/app.js' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, 'console.log("asset");');

    await app.close();
  });

  it('falls back to index.html for an unknown non-API path (SPA client-side routing)', async () => {
    const app = await buildServer(config);
    const response = await app.inject({ method: 'GET', url: '/sites/some-unknown-page' });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /admin shell/);

    await app.close();
  });

  it('an unknown /api path still returns a plain JSON 404, never swallowed by the SPA fallback', async () => {
    const app = await buildServer(config);
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: 'not found' });

    await app.close();
  });
});
