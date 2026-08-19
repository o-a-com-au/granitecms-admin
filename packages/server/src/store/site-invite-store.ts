import type { SiteInvite } from '../sites/site-invite.ts';
import type { Store } from './store.ts';
import { openInMemoryStore } from './in-memory-store.ts';

// The pending-invites list for a site (routes/site-invites.ts) - by
// siteId, the same shape as SiteAccessStore.listBySite.
export interface SiteInviteStore extends Store<SiteInvite> {
  listBySite(siteId: string): Promise<SiteInvite[]>;
}

export function openInMemorySiteInviteStore(): SiteInviteStore {
  const base = openInMemoryStore<SiteInvite>();
  return {
    ...base,
    async listBySite(siteId) {
      const invites = await base.list();
      return invites.filter((invite) => invite.siteId === siteId);
    },
  };
}
