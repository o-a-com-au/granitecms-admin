import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import '../../src/auth/session-types.ts';

type SessionStore = fastifySession.SessionStore;

// Permanent regression coverage, not throwaway: settles what the
// @fastify/session README leaves ambiguous, against this project's
// real Fastify 5.10 - never trusted from documentation alone (matches
// this repo's own precedent for @fastify/static/@fastify/rate-limit).

const SECRET = 'a'.repeat(32);

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  assert.ok(header, 'expected a set-cookie header');
  return header.split(';')[0] as string;
}

describe('session smoke test', () => {
  it('a session set in one request is readable in a later request via the signed cookie', async () => {
    const app = Fastify();
    await app.register(fastifyCookie);
    await app.register(fastifySession, { secret: SECRET, cookie: { secure: false } });

    app.get('/set', async (request) => {
      request.session.set('userId', 'abc');
      return { ok: true };
    });
    app.get('/get', async (request) => ({ userId: request.session.get('userId') ?? null }));

    const setResponse = await app.inject({ method: 'GET', url: '/set' });
    const cookie = extractCookie(setResponse.headers['set-cookie']);

    const getResponse = await app.inject({ method: 'GET', url: '/get', headers: { cookie } });
    assert.deepEqual(getResponse.json(), { userId: 'abc' });

    await app.close();
  });

  it('session.regenerate exists and issues a new session id', async () => {
    const app = Fastify();
    await app.register(fastifyCookie);
    await app.register(fastifySession, { secret: SECRET, cookie: { secure: false } });

    let idBefore = '';
    let idAfter = '';
    app.get('/regenerate', async (request) => {
      request.session.set('userId', 'abc');
      idBefore = request.session.sessionId;
      await request.session.regenerate();
      request.session.set('userId', 'abc');
      idAfter = request.session.sessionId;
      return { ok: true };
    });

    const response = await app.inject({ method: 'GET', url: '/regenerate' });
    assert.equal(response.statusCode, 200);
    assert.notEqual(idBefore, '');
    assert.notEqual(idAfter, '');
    assert.notEqual(idBefore, idAfter, 'regenerate must issue a new session id');

    await app.close();
  });

  it('destroying a session invalidates its cookie for later requests', async () => {
    const app = Fastify();
    await app.register(fastifyCookie);
    await app.register(fastifySession, { secret: SECRET, cookie: { secure: false } });

    app.get('/set', async (request) => {
      request.session.set('userId', 'abc');
      return { ok: true };
    });
    app.get('/destroy', async (request) => {
      await request.session.destroy();
      return { ok: true };
    });
    app.get('/get', async (request) => ({ userId: request.session.get('userId') ?? null }));

    const setResponse = await app.inject({ method: 'GET', url: '/set' });
    const cookie = extractCookie(setResponse.headers['set-cookie']);

    await app.inject({ method: 'GET', url: '/destroy', headers: { cookie } });
    const getResponse = await app.inject({ method: 'GET', url: '/get', headers: { cookie } });

    assert.deepEqual(getResponse.json(), { userId: null });

    await app.close();
  });

  it('a custom store is called with Node-style (id, session, callback) arguments, not promises', async () => {
    const calls: string[] = [];
    const customStore: SessionStore = {
      set(sessionId, _session, callback) {
        calls.push('set');
        assert.equal(typeof sessionId, 'string');
        assert.equal(typeof callback, 'function');
        callback();
      },
      get(sessionId, callback) {
        calls.push('get');
        assert.equal(typeof sessionId, 'string');
        assert.equal(typeof callback, 'function');
        callback(null, undefined);
      },
      destroy(sessionId, callback) {
        calls.push('destroy');
        assert.equal(typeof sessionId, 'string');
        assert.equal(typeof callback, 'function');
        callback();
      },
    };

    const app = Fastify();
    await app.register(fastifyCookie);
    await app.register(fastifySession, { secret: SECRET, cookie: { secure: false }, store: customStore });

    app.get('/set', async (request) => {
      request.session.set('userId', 'abc');
      return { ok: true };
    });

    const response = await app.inject({ method: 'GET', url: '/set' });
    assert.equal(response.statusCode, 200);
    assert.ok(calls.includes('set'), `expected the store's set() to be called, got: ${calls.join(', ')}`);

    await app.close();
  });
});
