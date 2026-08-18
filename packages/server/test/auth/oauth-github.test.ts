import { describe, it, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createGithubProvider } from '../../src/auth/oauth-github.ts';

function stubFetch(t: TestContext, profile: unknown, emails: unknown = []): void {
  t.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://api.github.com/user') {
      return new Response(JSON.stringify(profile), { status: 200 });
    }
    if (url === 'https://api.github.com/user/emails') {
      return new Response(JSON.stringify(emails), { status: 200 });
    }
    throw new Error(`unhandled fetch in test: ${url}`);
  });
}

describe('createGithubProvider resolveIdentity', () => {
  it('splits a combined name into firstName/lastName - GitHub has no separate given/family name fields', async (t) => {
    stubFetch(t, { email: 'jane@example.com', name: 'Jane Editor', login: 'janeeditor' });
    const provider = createGithubProvider('client-id', 'client-secret');

    const identity = await provider.resolveIdentity({ access_token: 'token' });

    assert.deepEqual(identity, { email: 'jane@example.com', firstName: 'Jane', lastName: 'Editor' });
  });

  it('falls back to splitting the login when name is null', async (t) => {
    stubFetch(t, { email: 'jane@example.com', name: null, login: 'janeeditor' });
    const provider = createGithubProvider('client-id', 'client-secret');

    const identity = await provider.resolveIdentity({ access_token: 'token' });

    assert.deepEqual(identity, { email: 'jane@example.com', firstName: 'janeeditor', lastName: '' });
  });

  it('a single-word name produces an empty lastName', async (t) => {
    stubFetch(t, { email: 'jane@example.com', name: 'Cher', login: 'cher' });
    const provider = createGithubProvider('client-id', 'client-secret');

    const identity = await provider.resolveIdentity({ access_token: 'token' });

    assert.deepEqual(identity, { email: 'jane@example.com', firstName: 'Cher', lastName: '' });
  });
});
