import type { FastifyInstance } from 'fastify';
import type { Store } from '../store/store.ts';
import type { AdminUser } from '../auth/users.ts';
import { normaliseUsername } from '../auth/users.ts';
import { createRequireAuth } from '../auth/require-auth.ts';
import { createRequireDeveloper } from '../auth/require-developer.ts';
import { createRequireSiteAccess } from '../auth/require-site-access.ts';
import { generatePassword, hashPassword } from '../auth/password.ts';
import type { Site } from '../sites/site.ts';
import { SiteNotFoundError } from '../sites/site-not-found-error.ts';
import { siteAccessId, type SiteAccess } from '../sites/site-access.ts';

// letters/digits/./_/- , non-empty, a reasonable ceiling - the first
// time a human picks a username *for someone else* rather than for
// themselves at bootstrap, and usernames are about to be used as a
// literal path segment (DELETE /:siteId/users/:userId) - an
// unrestricted value is a real risk here, not a style nit.
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

interface CreateSiteUserBody {
  username: string;
  name: string;
  email: string;
  password?: string;
}

function parseCreateSiteUserBody(body: unknown): CreateSiteUserBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.username !== 'string' || !USERNAME_PATTERN.test(record.username)) {
    return null;
  }
  if (typeof record.name !== 'string' || record.name.trim() === '') {
    return null;
  }
  if (typeof record.email !== 'string' || record.email.trim() === '') {
    return null;
  }
  if (record.password !== undefined && (typeof record.password !== 'string' || record.password.trim() === '')) {
    return null;
  }
  return { username: record.username, name: record.name, email: record.email, password: record.password as string | undefined };
}

interface ClientSummary {
  id: string;
  username: string;
  name: string;
  email: string;
  grantedAt: string;
}

// Never spreads AdminUser - mirrors routes/sites.ts's own
// toSiteListEntry precedent ("raw token never included, built by
// explicit mapping"), just for passwordHash/passwordSalt here instead.
function toClientSummary(user: AdminUser, access: SiteAccess): ClientSummary {
  return { id: user.id, username: user.username, name: user.name, email: user.email, grantedAt: access.grantedAt };
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
        return { statusCode: 400, error: 'Bad Request', message: 'username, name, and email are required' };
      }

      const site = await sitesStore.find(request.params.siteId);
      if (!site) {
        throw new SiteNotFoundError(request.params.siteId);
      }

      const userId = normaliseUsername(body.username);
      const existing = await usersStore.find(userId);

      if (!existing) {
        // Not found - create a fresh client account with a generated
        // (or supplied) password, plus the grant for this site.
        const password = body.password ?? generatePassword();
        const { hash, salt } = hashPassword(password);
        const now = new Date().toISOString();
        const user: AdminUser = {
          id: userId,
          username: body.username,
          passwordHash: hash,
          passwordSalt: salt,
          name: body.name,
          email: body.email,
          role: 'client',
          status: 'active',
          createdAt: now,
        };
        await usersStore.save(user);
        const access: SiteAccess = { id: siteAccessId(userId, site.id), userId, siteId: site.id, grantedAt: now };
        await siteAccessStore.save(access);

        reply.code(201);
        return { ...toClientSummary(user, access), password };
      }

      if (existing.role === 'developer') {
        reply.code(409);
        return { statusCode: 409, error: 'Conflict', message: 'That username already belongs to a developer account' };
      }

      // Found, already a client - never touch their existing
      // credentials/name/email. Only grant access to this site, and
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
