import type { FastifyRequest } from 'fastify';
import type { Store } from '../store/store.ts';
import type { AdminUser } from './users.ts';

// Direct analogue of the agent repo's own token-auth.ts AuthError:
// statusCode set explicitly in the constructor so the global error
// handler (server.ts) passes it through with its real message
// intact, never sanitising it as a generic 500.
export class AuthError extends Error {
  readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = 401;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: Pick<AdminUser, 'id' | 'username'> | null;
  }
}

// Applied as a per-route preHandler option, not a whole-file addHook -
// routes/auth.ts mixes an exempt route (login) with a guarded one
// (me) in the same file, so the check has to be granular to the
// route, matching the agent repo's own requireScope precedent for the
// same reason.
export function createRequireAuth(usersStore: Store<AdminUser>) {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    const userId = request.session.get('userId');
    if (!userId) {
      throw new AuthError('Login required');
    }

    const user = await usersStore.find(userId);
    if (!user) {
      // The session names a user that no longer exists (e.g. deleted
      // out of band) - destroy the now-stale session rather than
      // leaving a dangling reference.
      await request.session.destroy();
      throw new AuthError('Login required');
    }

    request.currentUser = { id: user.id, username: user.username };
  };
}
