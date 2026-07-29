import type { Session } from 'fastify';
import type fastifySession from '@fastify/session';
import type { Store } from '../store/store.ts';

// @fastify/session's own SessionStore type (confirmed empirically in
// session-smoke.test.ts, not assumed from its README): callback-style
// set(sessionId, session, callback)/get(sessionId, callback)/
// destroy(sessionId, callback), not promise-returning.
type SessionStore = fastifySession.SessionStore;

export interface SessionRecord {
  id: string;
  session: Session;
}

export function toSessionStore(store: Store<SessionRecord>): SessionStore {
  return {
    set(sessionId, session, callback) {
      store
        .save({ id: sessionId, session })
        .then(() => callback())
        .catch((error: unknown) => callback(error));
    },
    get(sessionId, callback) {
      store
        .find(sessionId)
        .then((record) => callback(null, record?.session ?? null))
        .catch((error: unknown) => callback(error));
    },
    destroy(sessionId, callback) {
      store
        .delete(sessionId)
        .then(() => callback())
        .catch((error: unknown) => callback(error));
    },
  };
}
