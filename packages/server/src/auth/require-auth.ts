import type { FastifyRequest } from 'fastify';
import type { Store } from '../store/store.ts';
import { planOf, type AdminUser } from './users.ts';

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
    // viaApiKey: acting through an API key (an AI agent) rather than a
    // login - the commit author says so (routes/sites.ts).
    currentUser: (Pick<AdminUser, 'id' | 'username' | 'firstName' | 'lastName' | 'email' | 'role' | 'status' | 'timezone' | 'plan'> & {
      viaApiKey?: true;
    }) | null;
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
    // An API key (api-keys/authenticate.ts has already checked it)
    // stands in for the session: it acts as its owner.
    const userId = request.apiKey ? request.apiKey.userId : request.session.get('userId');
    if (!userId) {
      throw new AuthError('Login required');
    }

    const user = await usersStore.find(userId);
    if (!user && request.apiKey) {
      throw new AuthError('Login required');
    }
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
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
      timezone: user.timezone,
      plan: planOf(user),
      ...(request.apiKey ? { viaApiKey: true as const } : {}),
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
