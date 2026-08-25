import type { SiteAccess } from '../../sites/site-access.ts';
import type { SiteAccessStore } from '../site-access-store.ts';
import type { SqliteDb } from './client.ts';
import { openSqliteStore } from './generic-store.ts';

// Mirrors openInMemorySiteAccessStore exactly (store/site-access-store.ts).
export function openSqliteSiteAccessStore(db: SqliteDb): SiteAccessStore {
  const base = openSqliteStore<SiteAccess>(db, 'site_access');
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
