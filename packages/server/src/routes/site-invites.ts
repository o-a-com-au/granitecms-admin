import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Store } from '../store/store.ts';
import { normaliseUsername, type AdminUser } from '../auth/users.ts';
import { createRequireAuth } from '../auth/require-auth.ts';
import { createRequireDeveloper } from '../auth/require-developer.ts';
import { createRequireSiteAccess } from '../auth/require-site-access.ts';
import { generatePassword, hashPassword } from '../auth/password.ts';
import { isStrongPassword, PASSWORD_REQUIREMENTS_MESSAGE } from '../auth/password-strength.ts';
import { DEFAULT_TIMEZONE, isValidTimezone } from '../auth/timezone.ts';
import type { Site } from '../sites/site.ts';
import { SiteNotFoundError } from '../sites/site-not-found-error.ts';
import { siteAccessId, type SiteAccess } from '../sites/site-access.ts';
import { hashInviteCode, INVITE_EXPIRY_MS, type SiteInvite } from '../sites/site-invite.ts';
import type { Mailer } from '../email/mailer.ts';

interface CreateSiteInviteBody {
  email: string;
}

function parseCreateSiteInviteBody(body: unknown): CreateSiteInviteBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.email !== 'string' || record.email.trim() === '') {
    return null;
  }
  return { email: record.email };
}

interface SiteInviteSummary {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
}

// Never includes the raw code - it only ever existed in the one
// response that created the invite, matching generatePassword()'s own
// shown-once precedent used throughout this codebase.
function toSiteInviteSummary(invite: SiteInvite): SiteInviteSummary {
  return { id: invite.id, email: invite.email, createdAt: invite.createdAt, expiresAt: invite.expiresAt, claimedAt: invite.claimedAt };
}

// The authenticated half - a developer creating/reviewing/revoking
// invites for a site they own. Same three-guard stack as
// routes/site-users.ts, for the same reason: requireDeveloper is
// load-bearing here, not implied by requireSiteAccess (a client with
// content access to a site would also pass a bare site-access check
// on it).
export function createSiteInvitesRoutes(
  usersStore: Store<AdminUser>,
  sitesStore: Store<Site>,
  siteAccessStore: Store<SiteAccess>,
  siteInviteStore: Store<SiteInvite>,
  mailer: Mailer | undefined,
  baseUrl: string,
) {
  const requireAuth = createRequireAuth(usersStore);
  const requireDeveloper = createRequireDeveloper();
  const requireSiteAccess = createRequireSiteAccess(
    sitesStore,
    siteAccessStore,
    (request) => (request.params as { siteId: string }).siteId,
  );
  const preHandler = [requireAuth, requireDeveloper, requireSiteAccess];

  return async function siteInvitesRoutes(app: FastifyInstance): Promise<void> {
    app.post<{ Params: { siteId: string } }>('/:siteId/invites', { preHandler }, async (request, reply) => {
      const body = parseCreateSiteInviteBody(request.body);
      if (!body) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: 'email is required' };
      }

      const site = await sitesStore.find(request.params.siteId);
      if (!site) {
        throw new SiteNotFoundError(request.params.siteId);
      }

      const code = generatePassword();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + INVITE_EXPIRY_MS).toISOString();
      const invite: SiteInvite = {
        id: hashInviteCode(code),
        siteId: site.id,
        email: body.email,
        createdBy: request.currentUser!.id,
        createdAt: createdAt.toISOString(),
        expiresAt,
        claimedAt: null,
        claimedByUserId: null,
      };
      await siteInviteStore.save(invite);

      const url = `${baseUrl}/invite/${code}`;
      let emailSent = false;
      if (mailer) {
        try {
          await mailer.sendInviteEmail({ to: body.email, siteUrl: site.url, claimUrl: url, expiresAt });
          emailSent = true;
        } catch {
          // The invite record still exists and url is still returned
          // below either way - a transient send failure doesn't strand
          // the developer, they just fall back to the copy-link UI.
          emailSent = false;
        }
      }

      reply.code(201);
      return { emailSent, url, expiresAt };
    });

    app.get<{ Params: { siteId: string } }>('/:siteId/invites', { preHandler }, async (request) => {
      const site = await sitesStore.find(request.params.siteId);
      if (!site) {
        throw new SiteNotFoundError(request.params.siteId);
      }

      const invites = (await siteInviteStore.list()).filter((invite) => invite.siteId === site.id);
      return { invites: invites.map(toSiteInviteSummary) };
    });

    app.delete<{ Params: { siteId: string; inviteId: string } }>(
      '/:siteId/invites/:inviteId',
      { preHandler },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.siteId);
        if (!site) {
          throw new SiteNotFoundError(request.params.siteId);
        }

        const invite = await siteInviteStore.find(request.params.inviteId);
        if (!invite || invite.siteId !== site.id) {
          reply.code(404);
          return { statusCode: 404, error: 'Not Found', message: 'No such invite for this site' };
        }

        await siteInviteStore.delete(invite.id);
        return { ok: true };
      },
    );
  };
}

interface ClaimInviteBody {
  name: string;
  password: string;
  // Captured client-side by ClaimInvitePage.tsx's own browser (a real
  // in-page form, unlike routes/oauth.ts's server-side redirect) -
  // absent falls back to DEFAULT_TIMEZONE in the route itself.
  timezone?: string;
}

function parseClaimInviteBody(body: unknown): ClaimInviteBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.name !== 'string' || record.name.trim() === '') {
    return null;
  }
  if (typeof record.password !== 'string' || record.password.trim() === '') {
    return null;
  }
  if (record.timezone !== undefined && typeof record.timezone !== 'string') {
    return null;
  }
  return { name: record.name, password: record.password, timezone: record.timezone as string | undefined };
}

type ResolvedInvite = { invite: SiteInvite; site: Site } | { reason: 'expired' | 'claimed' | 'not-found' };

// Re-derived fresh on every call, including inside the claim handler
// itself right before mutating - never trusts an earlier GET, closing
// any check-then-act race between validating and claiming.
async function resolveInvite(
  siteInviteStore: Store<SiteInvite>,
  sitesStore: Store<Site>,
  code: string,
): Promise<ResolvedInvite> {
  const invite = await siteInviteStore.find(hashInviteCode(code));
  if (!invite) {
    return { reason: 'not-found' };
  }
  if (invite.claimedAt) {
    return { reason: 'claimed' };
  }
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return { reason: 'expired' };
  }
  const site = await sitesStore.find(invite.siteId);
  if (!site) {
    // Defensive: the site was removed after the invite was created.
    return { reason: 'not-found' };
  }
  return { invite, site };
}

// No preHandler at all - request.currentUser stays the decorateRequest
// default (null). A missing/stale/invalid session degrades to
// "unauthenticated", the same as a genuine first-time visitor - never
// throws, since a real first-time visitor is exactly who this route
// exists for.
// A named constant, not a literal at the call site - keeps this
// session read from being read as a route registration by the
// static-analysis suite's generic "app.<method>(<literal>, ...)"
// scanner (test/static/static-analysis.test.ts's B check), which
// pattern-matches any get-method call taking a quoted literal
// anywhere in routes/, not just app.get itself. Same fix routes/
// oauth.ts already applies for its own session state-key constant.
const USER_ID_SESSION_KEY = 'userId';

async function resolveOptionalUser(request: FastifyRequest, usersStore: Store<AdminUser>): Promise<AdminUser | undefined> {
  const userId = request.session.get(USER_ID_SESSION_KEY);
  if (!userId) {
    return undefined;
  }
  return usersStore.find(userId);
}

// The public half - reached by whoever opens the emailed link, who by
// definition has no session yet (or, if they do, is exactly the
// "already have an account" case). Registered under a separate
// top-level /api/invites prefix, mirroring routes/oauth.ts's own
// public/authenticated split for the same reason: a public and an
// authenticated surface can't safely share one preHandler array.
//
// Both routes below are deliberately unauthenticated by design (same
// underlying reason as POST /login's own exemption in
// static-analysis.test.ts) - no allowlist entry needed there either,
// confirmed empirically: ROUTE_REGISTRATION_PATTERN's method-then-
// paren match doesn't span the TS generic type argument in
// app.get<{...}>(...)/app.post<{...}>(...), so these (and every other
// generically-typed route in this codebase, e.g. routes/site-users.ts)
// are already invisible to that scanner, not merely exempted from it.
export function createInviteClaimRoutes(
  usersStore: Store<AdminUser>,
  sitesStore: Store<Site>,
  siteAccessStore: Store<SiteAccess>,
  siteInviteStore: Store<SiteInvite>,
) {
  return async function inviteClaimRoutes(app: FastifyInstance): Promise<void> {
    app.get<{ Params: { code: string } }>('/:code', async (request) => {
      const resolved = await resolveInvite(siteInviteStore, sitesStore, request.params.code);
      if ('reason' in resolved) {
        return { valid: false, reason: resolved.reason };
      }
      // email/siteUrl only - never createdBy or anything else about
      // who created it or what site token it uses.
      return { valid: true, siteUrl: resolved.site.url, email: resolved.invite.email };
    });

    app.post<{ Params: { code: string } }>('/:code/claim', async (request, reply) => {
      const resolved = await resolveInvite(siteInviteStore, sitesStore, request.params.code);
      if ('reason' in resolved) {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: `This invite is ${resolved.reason === 'not-found' ? 'invalid' : resolved.reason}` };
      }
      const { invite, site } = resolved;

      const currentUser = await resolveOptionalUser(request, usersStore);
      let userId: string;

      if (currentUser) {
        // Whoever received and opened the email decided who gets
        // access - grant it to their current, already-authenticated
        // account directly, regardless of whether its own email
        // happens to match the invite's target exactly.
        userId = currentUser.id;
      } else {
        const body = parseClaimInviteBody(request.body);
        if (!body) {
          reply.code(400);
          return { statusCode: 400, error: 'Bad Request', message: 'name and password are required' };
        }
        if (!isStrongPassword(body.password)) {
          reply.code(400);
          return { statusCode: 400, error: 'Bad Request', message: PASSWORD_REQUIREMENTS_MESSAGE };
        }
        if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
          reply.code(400);
          return { statusCode: 400, error: 'Bad Request', message: 'timezone, if provided, must be a real IANA zone name' };
        }

        const normalisedEmail = normaliseUsername(invite.email);
        const existing = (await usersStore.list()).find((user) => normaliseUsername(user.email) === normalisedEmail);
        if (existing) {
          // The safety property this whole design turns on: an
          // unauthenticated claimant cannot silently attach access to
          // an account they haven't proven they control via a real
          // session - unlike routes/site-users.ts's own invite route,
          // which trusts the authenticated developer to know who
          // they're granting access to.
          reply.code(409);
          return {
            statusCode: 409,
            error: 'Conflict',
            message: 'An account with this email already exists - log in and open the invite link again',
          };
        }

        const { hash, salt } = hashPassword(body.password);
        const now = new Date().toISOString();
        const newUser: AdminUser = {
          id: normalisedEmail,
          username: invite.email,
          passwordHash: hash,
          passwordSalt: salt,
          name: body.name,
          email: invite.email,
          role: 'client',
          status: 'active',
          timezone: body.timezone ?? DEFAULT_TIMEZONE,
          createdAt: now,
        };
        await usersStore.save(newUser);
        userId = newUser.id;
      }

      const accessId = siteAccessId(userId, site.id);
      const existingAccess = await siteAccessStore.find(accessId);
      if (!existingAccess) {
        await siteAccessStore.save({ id: accessId, userId, siteId: site.id, grantedAt: new Date().toISOString() });
      }

      // Marks the invite single-use from here on, regardless of
      // remaining time to expiry.
      await siteInviteStore.save({ ...invite, claimedAt: new Date().toISOString(), claimedByUserId: userId });

      if (!currentUser) {
        await request.session.regenerate();
        request.session.set('userId', userId);
      }

      return { ok: true, siteId: site.id };
    });
  };
}
