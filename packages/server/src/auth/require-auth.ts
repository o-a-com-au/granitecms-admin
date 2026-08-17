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
    currentUser: Pick<AdminUser, 'id' | 'username' | 'name' | 'email' | 'role' | 'status' | 'timezone'> | null;
  }
}

// The bare "is there a valid, real session" check, with no pause
// gating - used only by the handful of routes that must stay reachable
// even for a paused account (GET /me, POST /pause, POST /resume,
// routes/auth.ts), so a paused user can still identify themselves and
// resume without being locked out entirely. Every other route uses
// requireAuth below instead.
export function createRequireSession(usersStore: Store<AdminUser>) {
  return async function requireSession(request: FastifyRequest): Promise<void> {
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

    request.currentUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      timezone: user.timezone,
    };
  };
}

// Applied as a per-route preHandler option, not a whole-file addHook -
// routes/auth.ts mixes exempt/lighter-gated routes (login, me, pause,
// resume) with fully-guarded ones in the same file, so the check has
// to be granular to the route, matching the agent repo's own
// requireScope precedent for the same reason.
//
// requireSession plus one more gate: a paused account is blocked from
// every route using this function, re-derived fresh on every single
// request (no session-embedded cache) - a pause takes effect on that
// account's very next request, including one already mid-session on a
// different device.
export function createRequireAuth(usersStore: Store<AdminUser>) {
  const requireSession = createRequireSession(usersStore);
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    await requireSession(request);
    if (request.currentUser?.status === 'paused') {
      throw new AuthError('Account paused');
    }
  };
}
