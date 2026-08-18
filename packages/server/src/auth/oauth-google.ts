import { OAuth2Client } from 'google-auth-library';
import type { OAuthProvider } from './oauth-provider.ts';
import { splitFullName } from './full-name.ts';

interface GoogleTokenResponse {
  id_token: string;
}

function isGoogleTokenResponse(value: unknown): value is GoogleTokenResponse {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).id_token === 'string';
}

// Extracted as a plain function of the already-verified payload (not
// inlined in resolveIdentity below) so it's testable without mocking
// OAuth2Client.verifyIdToken's real network/crypto - the only genuinely
// provider-specific decision here is which name fields to trust, not
// the token verification itself.
export function mapGooglePayloadToIdentity(payload: {
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}): { email: string; firstName: string; lastName: string } {
  // Prefer the payload's own given_name/family_name claims - real,
  // provider-supplied first/last names, not a heuristic split. Only
  // falls back to splitting the combined name (or the email, as a
  // last resort) when either is missing - some accounts (G Suite orgs
  // with restricted profile visibility) don't expose them even with
  // the profile scope requested below.
  if (payload.given_name && payload.family_name) {
    return { email: payload.email, firstName: payload.given_name, lastName: payload.family_name };
  }
  const { firstName, lastName } = splitFullName(payload.name ?? payload.email);
  return { email: payload.email, firstName, lastName };
}

// Verifies the ID token's signature via google-auth-library's own
// OAuth2Client.verifyIdToken() rather than hand-rolling JWT signature
// verification - the one new dependency this feature needs, justified
// on exactly that basis (this is not something to write from scratch).
export function createGoogleProvider(clientId: string, clientSecret: string): OAuthProvider {
  const client = new OAuth2Client(clientId);

  return {
    id: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId,
    clientSecret,
    scope: 'openid email profile',
    async resolveIdentity(tokenResponse: unknown) {
      if (!isGoogleTokenResponse(tokenResponse)) {
        throw new Error('Google token response did not include an ID token');
      }
      const ticket = await client.verifyIdToken({ idToken: tokenResponse.id_token, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.email_verified) {
        throw new Error('Google account has no verified email');
      }
      // Narrowing payload.email above doesn't narrow the whole payload
      // object's type (still TokenPayload's own email?: string) -
      // rebuilt explicitly so mapGooglePayloadToIdentity gets a real
      // guaranteed-string email.
      return mapGooglePayloadToIdentity({
        email: payload.email,
        name: payload.name,
        given_name: payload.given_name,
        family_name: payload.family_name,
      });
    },
  };
}
