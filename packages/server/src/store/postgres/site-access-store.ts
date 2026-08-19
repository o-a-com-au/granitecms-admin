import { eq } from 'drizzle-orm';
import type { SiteAccess } from '../../sites/site-access.ts';
import type { SiteAccessStore } from '../site-access-store.ts';
import type { Db } from './client.ts';
import { siteAccess } from './schema.ts';

export function openPostgresSiteAccessStore(db: Db): SiteAccessStore {
  return {
    async list() {
      return db.select().from(siteAccess);
    },
    async find(id) {
      const [row] = await db.select().from(siteAccess).where(eq(siteAccess.id, id));
      return row;
    },
    async save(record: SiteAccess) {
      await db.insert(siteAccess).values(record).onConflictDoUpdate({ target: siteAccess.id, set: record });
    },
    async delete(id) {
      await db.delete(siteAccess).where(eq(siteAccess.id, id));
    },
    async listBySite(siteId) {
      return db.select().from(siteAccess).where(eq(siteAccess.siteId, siteId));
    },
    async listByUser(userId) {
      return db.select().from(siteAccess).where(eq(siteAccess.userId, userId));
    },
  };
}
