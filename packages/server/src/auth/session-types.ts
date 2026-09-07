// @fastify/session's Session type only carries its own internal
// cookie options by default - custom session data must be declared
// via module augmentation to get real typing, rather than typed as
// unknown/any. Found empirically (a real TS2345 error, not assumed
// from the README) while writing the session smoke test.
import '@fastify/session';

declare module 'fastify' {
  interface Session {
    userId?: string;
    // CSRF protection for the OAuth authorization-code flow
    // (routes/oauth.ts): set right before redirecting to the
    // provider, checked back on callback.
    oauthState?: string;
    // The ?site= a user arrived with before starting an OAuth login
    // (routes/oauth.ts) - a real full-page round trip through the
    // provider and back, so this can't ride in React Router state the
    // way a plain-login redirect's destination does. null (not
    // undefined) when the user started OAuth with no ?site= at all,
    // distinct from never having started OAuth.
    oauthReturnToSite?: string | null;
  }
}
