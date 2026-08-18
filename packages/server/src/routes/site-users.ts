import type { FastifyInstance } from 'fastify';
import type { Store } from '../store/store.ts';
import type { AdminUser } from '../auth/users.ts';
import { normaliseUsername } from '../auth/users.ts';
import { createRequireAuth } from '../auth/require-auth.ts';
import { createRequireDeveloper } from '../auth/require-developer.ts';
import { createRequireSiteAccess } from '../auth/require-site-access.ts';
import { generatePassword, hashPassword } from '../auth/password.ts';
import { isStrongPassword, PASSWORD_REQUIREMENTS_MESSAGE } from '../auth/password-strength.ts';
import { DEFAULT_TIMEZONE } from '../auth/timezone.ts';
import type { Site } from '../sites/site.ts';
import { SiteNotFoundError } from '../sites/site-not-found-error.ts';
import { siteAccessId, type SiteAccess } from '../sites/site-access.ts';

interface CreateSiteUserBody {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
}

function parseCreateSiteUserBody(body: unknown): CreateSiteUserBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.firstName !== 'string' || record.firstName.trim() === '') {
    return null;
  }
  if (record.lastName !== undefined && typeof record.lastName !== 'string') {
    return null;
  }
  if (typeof record.email !== 'string' || record.email.trim() === '') {
    return null;
  }
  if (record.password !== undefined && (typeof record.password !== 'string' || record.password.trim() === '')) {
    return null;
  }
  return {
    firstName: record.firstName,
    lastName: (record.lastName as string | undefined) ?? '',
    email: record.email,
    password: record.password as string | undefined,
  };
}

interface ClientSummary {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  grantedAt: string;
}

// Never spreads AdminUser - mirrors routes/sites.ts's own
// toSiteListEntry precedent ("raw token never included, built by
// explicit mapping"), just for passwordHash/passwordSalt here instead.
function toClientSummary(user: AdminUser, access: SiteAccess): ClientSummary {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    grantedAt: access.grantedAt,
  };
}

export function createSiteUsersRoutes(usersStore: Store<AdminUser>, sitesStore: Store<Site>, siteAccessStore: Store<SiteAccess>) {
  const requireAuth = createRequireAuth(usersStore);
  const requireDeveloper = createRequireDeveloper();
  const requireSiteAccess = createRequireSiteAccess(
    sitesStore,
    siteAccessStore,
    (request) => (request.params as { siteId: string }).siteId,
  );
  // requireDeveloper is load-bearing here, not implied by
  // requireSiteAccess: a client with legitimate content access to a
  // site would also pass a bare site-access check on that same site,
  // so without this explicit role gate they could list/invite/revoke
  // on their own site's roster.
  const preHandler = [requireAuth, requireDeveloper, requireSiteAccess];

  return async function siteUsersRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Params: { siteId: string } }>('/:siteId/users', { preHandler }, async (request, reply) => {
      const body = parseCreateSiteUserBody(request.body);
      if (!body) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: 'first name and email are required' };
      }
      // Only a caller-supplied password is strength-checked - the
      // generated fallback below is a machine-random one-time
      // credential, not a human-composed one, so this rule doesn't
      // apply to it.
      if (body.password !== undefined && !isStrongPassword(body.password)) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: PASSWORD_REQUIREMENTS_MESSAGE };
      }

      const site = await sitesStore.find(request.params.siteId);
      if (!site) {
        throw new SiteNotFoundError(request.params.siteId);
      }

      // Identity is derived from email, never a client-supplied
      // username - matching every other account-creation path in this
      // codebase (routes/oauth.ts's findOrCreateUser, the email-invite
      // claim route). A list+filter lookup, not Store.find(id): there's
      // no username input to derive the id from up front any more.
      const normalisedEmail = normaliseUsername(body.email);
      const existing = (await usersStore.list()).find((user) => normaliseUsername(user.email) === normalisedEmail);

      if (!existing) {
        // Not found - create a fresh client account with a generated
        // (or supplied) password, plus the grant for this site.
        const password = body.password ?? generatePassword();
        const { hash, salt } = hashPassword(password);
        const now = new Date().toISOString();
        const user: AdminUser = {
          id: normalisedEmail,
          username: body.email,
          passwordHash: hash,
          passwordSalt: salt,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          role: 'client',
          status: 'active',
          // A developer creating this on someone else's behalf - the
          // developer's own browser timezone has no relationship to
          // the invitee's, so this always defaults, editable by the
          // invitee afterward via Account Details.
          timezone: DEFAULT_TIMEZONE,
          createdAt: now,
        };
        await usersStore.save(user);
        const access: SiteAccess = { id: siteAccessId(user.id, site.id), userId: user.id, siteId: site.id, grantedAt: now };
        await siteAccessStore.save(access);

        reply.code(201);
        return { ...toClientSummary(user, access), password };
      }

      if (existing.role === 'developer') {
        reply.code(409);
        return { statusCode: 409, error: 'Conflict', message: 'That email already belongs to a developer account' };
      }

      // Found, already a client - never touch their existing
      // credentials/name(s)/email. Only grant access to this site, and
      // only if they don't already have it (re-inviting to a site
      // they're already on is a no-op, not a bumped grantedAt).
      const accessId = siteAccessId(existing.id, site.id);
      let access = await siteAccessStore.find(accessId);
      if (!access) {
        access = { id: accessId, userId: existing.id, siteId: site.id, grantedAt: new Date().toISOString() };
        await siteAccessStore.save(access);
      }

      return toClientSummary(existing, access);
    });

    app.get<{ Params: { siteId: string } }>('/:siteId/users', { preHandler }, async (request) => {
      const site = await sitesStore.find(request.params.siteId);
      if (!site) {
        throw new SiteNotFoundError(request.params.siteId);
      }

      const grants = (await siteAccessStore.list()).filter((access) => access.siteId === site.id);
      const summaries = await Promise.all(
        grants.map(async (grant) => {
          const user = await usersStore.find(grant.userId);
          return user ? toClientSummary(user, grant) : null;
        }),
      );

      return { clients: summaries.filter((summary): summary is ClientSummary => summary !== null) };
    });

    app.delete<{ Params: { siteId: string; userId: string } }>(
      '/:siteId/users/:userId',
      { preHandler },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.siteId);
        if (!site) {
          throw new SiteNotFoundError(request.params.siteId);
        }

        const accessId = siteAccessId(request.params.userId, site.id);
        const access = await siteAccessStore.find(accessId);
        if (!access) {
          reply.code(404);
          return { statusCode: 404, error: 'Not Found', message: 'No access grant for this user on this site' };
        }

        // Grant removed first, account second - a request racing this
        // deletion sees requireAuth still succeed but requireSiteAccess
        // already 404 on the now-gone grant, never a window where the
        // account is gone but the grant isn't.
        await siteAccessStore.delete(accessId);

        const remaining = (await siteAccessStore.list()).filter((a) => a.userId === request.params.userId);
        let accountDeleted = false;
        if (remaining.length === 0) {
          await usersStore.delete(request.params.userId);
          accountDeleted = true;
        }

        return { ok: true, accountDeleted };
      },
    );
  };
}
