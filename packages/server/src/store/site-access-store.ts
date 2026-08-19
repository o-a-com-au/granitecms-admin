import type { SiteAccess } from '../sites/site-access.ts';
import type { Store } from './store.ts';
import { openInMemoryStore } from './in-memory-store.ts';

// Two directions routes/site-users.ts and routes/sites.ts both need:
// "who has access to this site" (Manage Access) and "which sites can
// this client see" (their own site list). SiteAccess.id is a
// deterministic `userId:siteId` composite, but that doesn't help
// either of these - both need a real by-column lookup.
export interface SiteAccessStore extends Store<SiteAccess> {
  listBySite(siteId: string): Promise<SiteAccess[]>;
  listByUser(userId: string): Promise<SiteAccess[]>;
}

export function openInMemorySiteAccessStore(): SiteAccessStore {
  const base = openInMemoryStore<SiteAccess>();
  return {
    ...base,
    async listBySite(siteId) {
      const grants = await base.list();
      return grants.filter((grant) => grant.siteId === siteId);
    },
    async listByUser(userId) {
      const grants = await base.list();
      return grants.filter((grant) => grant.userId === userId);
    },
  };
}
