import type { FastifyRequest } from 'fastify';
import type { Store } from '../store/store.ts';
import type { Site } from '../sites/site.ts';
import { SiteNotFoundError } from '../sites/site-not-found-error.ts';
import { siteAccessId, type SiteAccess } from '../sites/site-access.ts';

// getSiteId is supplied per call site rather than guessed from a fixed
// param name internally - routes/sites.ts uses :id, routes/site-users.ts
// uses :siteId, and this keeps both typesafe without either file
// pretending the other's param name is its own.
//
// A denied client or wrong-owner developer gets the exact same
// SiteNotFoundError (404) a genuinely nonexistent site would - no
// request can distinguish "not yours" from "doesn't exist", matching
// this codebase's own established preference (see git.ts's own
// invalid-ref/not-found-at-ref non-collapse note for the *opposite*
// case - that one's about a route with nothing sensitive to hide,
// this one's the reverse).
export function createRequireSiteAccess(
  sitesStore: Store<Site>,
  siteAccessStore: Store<SiteAccess>,
  getSiteId: (request: FastifyRequest) => string,
) {
  return async function requireSiteAccess(request: FastifyRequest): Promise<void> {
    const siteId = getSiteId(request);
    const site = await sitesStore.find(siteId);
    if (!site) {
      throw new SiteNotFoundError(siteId);
    }

    // Always runs after requireAuth in the preHandler array, which
    // already throws if this were null - narrowed explicitly rather
    // than asserted, matching this codebase's existing defensive style
    // (see routes/sites.ts's own requireCommitAuthor).
    const user = request.currentUser;
    if (!user) {
      throw new SiteNotFoundError(siteId);
    }

    if (user.role === 'developer') {
      if (site.ownerId !== user.id) {
        throw new SiteNotFoundError(siteId);
      }
      return;
    }

    const access = await siteAccessStore.find(siteAccessId(user.id, site.id));
    if (!access) {
      throw new SiteNotFoundError(siteId);
    }
  };
}
