import { OAuth2Client } from 'google-auth-library';
import type { OAuthProvider } from './oauth-provider.ts';

interface GoogleTokenResponse {
  id_token: string;
}

function isGoogleTokenResponse(value: unknown): value is GoogleTokenResponse {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).id_token === 'string';
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
      return { email: payload.email, name: payload.name ?? payload.email };
    },
  };
}
