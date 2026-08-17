import type { FastifyInstance } from 'fastify';
import type { Store } from '../store/store.ts';
import type { AdminUser } from '../auth/users.ts';
import { normaliseUsername } from '../auth/users.ts';
import { DUMMY_HASH, DUMMY_SALT, hashPassword, verifyPassword } from '../auth/password.ts';
import { isStrongPassword, PASSWORD_REQUIREMENTS_MESSAGE } from '../auth/password-strength.ts';
import { DEFAULT_TIMEZONE, isValidTimezone } from '../auth/timezone.ts';
import { createRequireAuth, createRequireSession } from '../auth/require-auth.ts';
import type { SessionRecord } from '../auth/session-store-adapter.ts';

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

interface SignupBody {
  name: string;
  email: string;
  password: string;
  // Absent for any caller that isn't a real browser capturing its own
  // Intl.DateTimeFormat().resolvedOptions().timeZone (SignupPage.tsx) -
  // defaults to DEFAULT_TIMEZONE in the route itself, not here.
  timezone?: string;
}

function parseSignupBody(body: unknown): SignupBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.name !== 'string' || record.name.trim() === '') {
    return null;
  }
  if (typeof record.email !== 'string' || record.email.trim() === '') {
    return null;
  }
  if (typeof record.password !== 'string' || record.password === '') {
    return null;
  }
  if (record.timezone !== undefined && typeof record.timezone !== 'string') {
    return null;
  }
  return { name: record.name, email: record.email, password: record.password, timezone: record.timezone as string | undefined };
}

interface UpdateAccountBody {
  name?: string;
  email?: string;
  timezone?: string;
}

function parseUpdateAccountBody(body: unknown): UpdateAccountBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (record.name !== undefined && (typeof record.name !== 'string' || record.name.trim() === '')) {
    return null;
  }
  if (record.email !== undefined && (typeof record.email !== 'string' || record.email.trim() === '')) {
    return null;
  }
  if (record.timezone !== undefined && (typeof record.timezone !== 'string' || record.timezone.trim() === '')) {
    return null;
  }
  return {
    name: record.name as string | undefined,
    email: record.email as string | undefined,
    timezone: record.timezone as string | undefined,
  };
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

function parseChangePasswordBody(body: unknown): ChangePasswordBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.currentPassword !== 'string' || typeof record.newPassword !== 'string') {
    return null;
  }
  if (record.newPassword.trim() === '') {
    return null;
  }
  return { currentPassword: record.currentPassword, newPassword: record.newPassword };
}

export function createAuthRoutes(usersStore: Store<AdminUser>, sessionRecordStore: Store<SessionRecord>) {
  const requireSession = createRequireSession(usersStore);
  const requireAuth = createRequireAuth(usersStore);

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
      return {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        timezone: user.timezone,
      };
    });

    // Public, unauthenticated by design - self-serve account creation,
    // the same reasoning as /login's own exemption. Always role:
    // 'developer' (a client account can only ever be created via a
    // developer's invite, routes/site-users.ts, never an unsolicited
    // signup) - the exact same shape routes/oauth.ts's own
    // findOrCreateUser already builds for an OAuth-created developer,
    // just reached by password instead. username is never asked for -
    // it's derived from email, matching every other account-creation
    // path in this codebase now.
    app.post('/signup', async (request, reply) => {
      const body = parseSignupBody(request.body);
      if (!body) {
        reply.code(400);
        return {
          statusCode: 400,
          error: 'Bad Request',
          message: 'name, email, and password are required',
        };
      }
      if (!isStrongPassword(body.password)) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: PASSWORD_REQUIREMENTS_MESSAGE };
      }
      if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: 'timezone, if provided, must be a real IANA zone name' };
      }

      const normalisedEmail = normaliseUsername(body.email);
      const existing = (await usersStore.list()).find((user) => normaliseUsername(user.email) === normalisedEmail);
      if (existing) {
        reply.code(409);
        return { statusCode: 409, error: 'Conflict', message: 'An account with this email already exists - log in instead' };
      }

      const { hash, salt } = hashPassword(body.password);
      const user: AdminUser = {
        id: normalisedEmail,
        username: body.email,
        passwordHash: hash,
        passwordSalt: salt,
        name: body.name,
        email: body.email,
        role: 'developer',
        status: 'active',
        timezone: body.timezone ?? DEFAULT_TIMEZONE,
        createdAt: new Date().toISOString(),
      };
      await usersStore.save(user);

      await request.session.regenerate();
      request.session.set('userId', user.id);

      return {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        timezone: user.timezone,
      };
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

    // Ordinary requireAuth, not requireSession - editing your profile
    // isn't part of the "get yourself unblocked while paused" escape
    // hatch /me, /pause, and /resume exist for. Username is never
    // accepted here - it's the record's own id and a foreign key
    // throughout (SiteAccess, Site.ownerId, the session's own userId),
    // so it stays fixed; only name/email are editable.
    app.patch('/me', { preHandler: requireAuth }, async (request, reply) => {
      const body = parseUpdateAccountBody(request.body);
      if (!body) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: 'name and email, if provided, must be non-empty' };
      }
      if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: 'timezone, if provided, must be a real IANA zone name' };
      }

      const user = request.currentUser!;
      const record = await usersStore.find(user.id);
      if (!record) {
        reply.code(404);
        return { statusCode: 404, error: 'Not Found', message: 'Account no longer exists' };
      }

      const updated: AdminUser = {
        ...record,
        name: body.name ?? record.name,
        email: body.email ?? record.email,
        timezone: body.timezone ?? record.timezone,
      };
      await usersStore.save(updated);

      return {
        id: updated.id,
        username: updated.username,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        timezone: updated.timezone,
      };
    });

    app.post('/change-password', { preHandler: requireAuth }, async (request, reply) => {
      const body = parseChangePasswordBody(request.body);
      if (!body) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: 'currentPassword and newPassword are required' };
      }
      if (!isStrongPassword(body.newPassword)) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: PASSWORD_REQUIREMENTS_MESSAGE };
      }

      const user = request.currentUser!;
      const record = await usersStore.find(user.id);
      if (!record) {
        reply.code(404);
        return { statusCode: 404, error: 'Not Found', message: 'Account no longer exists' };
      }

      if (!verifyPassword(body.currentPassword, record.passwordHash, record.passwordSalt)) {
        // A specific message, unlike /login's deliberately generic one -
        // the caller is already authenticated as this exact account, so
        // there's no username to enumerate here.
        reply.code(401);
        return { statusCode: 401, error: 'Unauthorized', message: 'Current password is incorrect' };
      }

      const { hash, salt } = hashPassword(body.newPassword);
      await usersStore.save({ ...record, passwordHash: hash, passwordSalt: salt });

      // Logs out every other session belonging to this account - a
      // password change is exactly the moment that should invalidate
      // any session someone else might be holding. The caller's own
      // current session is left alone (excluded by sessionId), so
      // changing your own password never logs you out of the tab you
      // did it from.
      const allSessions = await sessionRecordStore.list();
      const currentSessionId = request.session.sessionId;
      await Promise.all(
        allSessions
          .filter((sessionRecord) => sessionRecord.session.userId === user.id && sessionRecord.id !== currentSessionId)
          .map((sessionRecord) => sessionRecordStore.delete(sessionRecord.id)),
      );

      return { ok: true };
    });
  };
}
