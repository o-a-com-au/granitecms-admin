import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../../src/server.ts';

// CSRF posture for cookie-based sessions (Group B design note): with
// no @fastify/cors registered, a genuine cross-origin fetch/XHR with
// Content-Type: application/json triggers a CORS preflight a
// no-CORS-headers server blocks outright. SameSite=Lax blocks cookie
// attachment on cross-site POST/PUT/DELETE entirely. The one shape
// neither of those stops is a plain cross-site HTML form POST (a
// CORS-exempt "simple request") - but a bare form can only send
// application/x-www-form-urlencoded, multipart/form-data, or
// text/plain, never application/json. This test confirms empirically
// (not assumed) that Fastify's own default body parser already
// rejects a request with one of those content types against a
// JSON-only route, closing that last gap without any bespoke code.
describe('CSRF posture', () => {
  it('a form-encoded POST to a JSON-only route is rejected, not processed as a valid login attempt', async () => {
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'username=admin&password=admin',
    });

    assert.notEqual(response.statusCode, 200, 'a form-encoded body must never be accepted as a successful login');
    assert.equal(response.statusCode, 415, 'Fastify rejects an unrecognised content type outright');

    await app.close();
  });

  it('a multipart/form-data POST to a JSON-only route is likewise rejected', async () => {
    const app = await buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'multipart/form-data; boundary=----x' },
      payload: '------x\r\nContent-Disposition: form-data; name="username"\r\n\r\nadmin\r\n------x--',
    });

    assert.notEqual(response.statusCode, 200);
    assert.equal(response.statusCode, 415);

    await app.close();
  });
});
