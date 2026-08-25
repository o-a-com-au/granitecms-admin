import type { SiteInvite } from '../../sites/site-invite.ts';
import type { SiteInviteStore } from '../site-invite-store.ts';
import type { SqliteDb } from './client.ts';
import { openSqliteStore } from './generic-store.ts';

// Mirrors openInMemorySiteInviteStore exactly (store/site-invite-store.ts).
export function openSqliteSiteInviteStore(db: SqliteDb): SiteInviteStore {
  const base = openSqliteStore<SiteInvite>(db, 'site_invites');
  return {
    ...base,
    async listBySite(siteId) {
      const invites = await base.list();
      return invites.filter((invite) => invite.siteId === siteId);
    },
  };
}
