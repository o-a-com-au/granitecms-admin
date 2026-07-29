// @fastify/session's Session type only carries its own internal
// cookie options by default - custom session data must be declared
// via module augmentation to get real typing, rather than typed as
// unknown/any. Found empirically (a real TS2345 error, not assumed
// from the README) while writing the session smoke test.
import '@fastify/session';

declare module 'fastify' {
  interface Session {
    userId?: string;
  }
}
