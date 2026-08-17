import type { FastifyInstance } from 'fastify';
import type { Store } from '../store/store.ts';
import type { AdminUser } from '../auth/users.ts';
import { normaliseUsername } from '../auth/users.ts';
import { DUMMY_HASH, DUMMY_SALT, verifyPassword } from '../auth/password.ts';
import { createRequireSession } from '../auth/require-auth.ts';

interface LoginBody {
  username: string;
  password: string;
}

function parseLoginBody(body: unknown): LoginBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.username !== 'string' || typeof record.password !== 'string') {
    return null;
  }
  return { username: record.username, password: record.password };
}

const INVALID_CREDENTIALS_MESSAGE = 'Invalid username or password';

export function createAuthRoutes(usersStore: Store<AdminUser>) {
  const requireSession = createRequireSession(usersStore);

  return async function authRoutes(app: FastifyInstance): Promise<void> {
    app.post('/login', async (request, reply) => {
      const body = parseLoginBody(request.body);
      const user = body ? await usersStore.find(normaliseUsername(body.username)) : undefined;

      // Always run verifyPassword, win or lose - scrypt is
      // deliberately slow, so skipping it for an unknown username
      // would leak which field was wrong through response timing,
      // not just through the response body.
      const passwordOk = body
        ? verifyPassword(
            body.password,
            user?.passwordHash ?? DUMMY_HASH,
            user?.passwordSalt ?? DUMMY_SALT,
          )
        : false;

      if (!user || !passwordOk) {
        reply.code(401);
        return { error: INVALID_CREDENTIALS_MESSAGE };
      }

      await request.session.regenerate();
      request.session.set('userId', user.id);

      // Same shape GET /me already returns via request.currentUser -
      // login was the one place still trimming it down to id/username,
      // an oversight now that the account popover needs name/email too.
      return { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, status: user.status };
    });

    // Exempt from requireAuth, not guarded by it: logout must succeed
    // even against an already-expired/invalid session - requireAuth
    // would 401 exactly the state logout exists to clean up.
    // Idempotent and always 200.
    app.post('/logout', async (request) => {
      await request.session.destroy();
      return { ok: true };
    });

    // This route IS B1's mechanism, not an exemption from requireAuth:
    // the frontend calls it to decide whether to redirect to /login.
    // A 401 here is the guard working, not a bug to route around.
    //
    // Uses the lighter requireSession, not requireAuth - a paused
    // account must still be able to identify itself here (status:
    // 'paused' included), so the frontend can show a dedicated "your
    // account is paused" notice with a Resume button instead of just
    // silently bouncing to the login screen with no explanation.
    app.get('/me', { preHandler: requireSession }, async (request) => request.currentUser);

    // Both pause and resume use requireSession too, deliberately not
    // requireAuth - resume in particular must stay reachable *while
    // paused*, or a paused account could never get back in without
    // someone else intervening. Idempotent: pausing an already-paused
    // account (or resuming an already-active one) is a no-op, not an
    // error - purely self-directed, no route accepts a target user id.
    app.post('/pause', { preHandler: requireSession }, async (request) => {
      const user = request.currentUser!;
      const record = await usersStore.find(user.id);
      if (record && record.status !== 'paused') {
        await usersStore.save({ ...record, status: 'paused' });
      }
      return { status: 'paused' };
    });

    app.post('/resume', { preHandler: requireSession }, async (request) => {
      const user = request.currentUser!;
      const record = await usersStore.find(user.id);
      if (record && record.status !== 'active') {
        await usersStore.save({ ...record, status: 'active' });
      }
      return { status: 'active' };
    });
  };
}
