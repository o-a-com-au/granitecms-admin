import { eq } from 'drizzle-orm';
import type { Site } from '../../sites/site.ts';
import type { SiteStore } from '../site-store.ts';
import type { Db } from './client.ts';
import { sites } from './schema.ts';

export function openPostgresSiteStore(db: Db): SiteStore {
  return {
    async list() {
      return db.select().from(sites);
    },
    async find(id) {
      const [row] = await db.select().from(sites).where(eq(sites.id, id));
      return row;
    },
    async save(record: Site) {
      await db.insert(sites).values(record).onConflictDoUpdate({ target: sites.id, set: record });
    },
    async delete(id) {
      await db.delete(sites).where(eq(sites.id, id));
    },
    async listByOwner(ownerId) {
      return db.select().from(sites).where(eq(sites.ownerId, ownerId));
    },
  };
}
