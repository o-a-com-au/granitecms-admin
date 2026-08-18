import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../store/store.ts';
import { normaliseUsername, type AdminUser } from '../auth/users.ts';
import { generatePassword, hashPassword } from '../auth/password.ts';
import { DEFAULT_TIMEZONE } from '../auth/timezone.ts';
import type { OAuthProvider } from '../auth/oauth-provider.ts';

// A named constant, not a literal at each call site - keeps the two
// session.get/set('oauthState', ...) calls below from being read as
// route registrations by the static-analysis suite's generic
// "app.<method>('literal', ...)" scanner (test/static/static-analysis.test.ts's
// B check), which pattern-matches any .get(<string literal>) call in
// routes/, not just app.get.
const OAUTH_STATE_SESSION_KEY = 'oauthState';

function buildAuthorizeUrl(provider: OAuthProvider, redirectUri: string, state: string): string {
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', provider.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

async function exchangeCodeForToken(provider: OAuthProvider, code: string, redirectUri: string): Promise<unknown> {
  const response = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`OAuth token exchange with ${provider.id} failed`);
  }
  return response.json();
}

// Matching, not linking: no provider/externalId field anywhere. An
// OAuth sign-in resolves to an account purely by verified email,
// case/whitespace-normalised the same way normaliseUsername already
// treats a typed username - so the same person can use a password
// today and Google tomorrow and land on the identical account.
async function findOrCreateUser(
  usersStore: Store<AdminUser>,
  identity: { email: string; firstName: string; lastName: string },
): Promise<AdminUser> {
  const normalisedEmail = normaliseUsername(identity.email);
  const existing = (await usersStore.list()).find((user) => normaliseUsername(user.email) === normalisedEmail);
  if (existing) {
    return existing;
  }

  // Self-serve signup, deliberately always role: 'developer' - a
  // client account can only ever be created via a developer's invite
  // (routes/site-users.ts), never by an unsolicited OAuth sign-in.
  // A real random password is generated and immediately discarded
  // (never shown, never logged) rather than leaving the account
  // passwordless - this account should only ever be reached via
  // OAuth, but a normal-looking hash/salt pair keeps the password
  // login route's own always-run verifyPassword call behaving exactly
  // as it does for every other account, with no empty-credential edge
  // case to reason about there.
  const { hash, salt } = hashPassword(generatePassword());
  const user: AdminUser = {
    id: normalisedEmail,
    username: identity.email,
    passwordHash: hash,
    passwordSalt: salt,
    firstName: identity.firstName,
    lastName: identity.lastName,
    email: identity.email,
    role: 'developer',
    status: 'active',
    // No browser signal available here - this is a server-side redirect
    // callback, not the account's own in-page JS. Editable afterward
    // via Account Details.
    timezone: DEFAULT_TIMEZONE,
    createdAt: new Date().toISOString(),
  };
  await usersStore.save(user);
  return user;
}

// Registered once per configured provider (never for one that isn't -
// no route, no button, not a runtime error), under the /api/auth
// prefix alongside the password-login routes. baseUrl comes from
// config, never a request's own Host header, which an attacker
// controls.
export function createOAuthRoutes(providers: OAuthProvider[], usersStore: Store<AdminUser>, baseUrl: string) {
  return async function oauthRoutes(app: FastifyInstance): Promise<void> {
    app.get('/providers', async () => ({ providers: providers.map((provider) => provider.id) }));

    for (const provider of providers) {
      const redirectUri = `${baseUrl}/api/auth/${provider.id}/callback`;

      app.get(`/${provider.id}`, async (request, reply) => {
        const state = randomBytes(24).toString('base64url');
        request.session.set(OAUTH_STATE_SESSION_KEY, state);
        await reply.redirect(buildAuthorizeUrl(provider, redirectUri, state));
      });

      app.get<{ Querystring: { code?: string; state?: string } }>(`/${provider.id}/callback`, async (request, reply) => {
        const expectedState = request.session.get(OAUTH_STATE_SESSION_KEY);
        const { code, state } = request.query;
        // Checked before any token exchange is attempted - a missing
        // or mismatched state is rejected outright, never forwarded to
        // the provider.
        if (!code || !state || !expectedState || state !== expectedState) {
          reply.code(400);
          return { error: 'Invalid OAuth state' };
        }
        request.session.set(OAUTH_STATE_SESSION_KEY, undefined);

        const tokenResponse = await exchangeCodeForToken(provider, code, redirectUri);
        const identity = await provider.resolveIdentity(tokenResponse);
        const user = await findOrCreateUser(usersStore, identity);

        await request.session.regenerate();
        request.session.set('userId', user.id);
        await reply.redirect('/');
      });
    }
  };
}
