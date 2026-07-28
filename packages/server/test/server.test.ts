import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.ts';

describe('server', () => {
  it('A2: GET /api/health returns ok', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });

    await app.close();
  });
});
