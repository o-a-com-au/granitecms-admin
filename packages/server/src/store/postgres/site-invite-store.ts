import { eq } from 'drizzle-orm';
import type { SiteInvite } from '../../sites/site-invite.ts';
import type { SiteInviteStore } from '../site-invite-store.ts';
import type { Db } from './client.ts';
import { siteInvites } from './schema.ts';

export function openPostgresSiteInviteStore(db: Db): SiteInviteStore {
  return {
    async list() {
      return db.select().from(siteInvites);
    },
    async find(id) {
      const [row] = await db.select().from(siteInvites).where(eq(siteInvites.id, id));
      return row;
    },
    async save(record: SiteInvite) {
      await db.insert(siteInvites).values(record).onConflictDoUpdate({ target: siteInvites.id, set: record });
    },
    async delete(id) {
      await db.delete(siteInvites).where(eq(siteInvites.id, id));
    },
    async listBySite(siteId) {
      return db.select().from(siteInvites).where(eq(siteInvites.siteId, siteId));
    },
  };
}
