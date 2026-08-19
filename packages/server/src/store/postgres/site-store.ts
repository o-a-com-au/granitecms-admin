import { eq } from 'drizzle-orm';
import type { Site } from '../../sites/site.ts';
import { encryptSiteToken, decryptSiteToken } from '../../sites/site-token-crypto.ts';
import type { SiteStore } from '../site-store.ts';
import type { Db } from './client.ts';
import { sites } from './schema.ts';

// Transparent at the store boundary: every Site the rest of the app
// sees (routes, tests, everything satisfying the SiteStore interface)
// always carries a plaintext token, exactly as before - encryption is
// purely a detail of what actually lands in the `token` column here,
// via encryptSiteToken/decryptSiteToken (sites/site-token-crypto.ts).
function decryptRow(row: Site, key: Buffer): Site {
  return { ...row, token: decryptSiteToken(row.token, key) };
}

export function openPostgresSiteStore(db: Db, encryptionKey: Buffer): SiteStore {
  return {
    async list() {
      const rows = await db.select().from(sites);
      return rows.map((row) => decryptRow(row, encryptionKey));
    },
    async find(id) {
      const [row] = await db.select().from(sites).where(eq(sites.id, id));
      return row ? decryptRow(row, encryptionKey) : undefined;
    },
    async save(record: Site) {
      const encrypted: Site = { ...record, token: encryptSiteToken(record.token, encryptionKey) };
      await db.insert(sites).values(encrypted).onConflictDoUpdate({ target: sites.id, set: encrypted });
    },
    async delete(id) {
      await db.delete(sites).where(eq(sites.id, id));
    },
    async listByOwner(ownerId) {
      const rows = await db.select().from(sites).where(eq(sites.ownerId, ownerId));
      return rows.map((row) => decryptRow(row, encryptionKey));
    },
  };
}
