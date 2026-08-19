import { eq } from 'drizzle-orm';
import type { SiteTokenEncryptionKeyRecord } from '../../sites/site-token-encryption-key.ts';
import type { Store } from '../store.ts';
import type { Db } from './client.ts';
import { siteTokenEncryptionKey } from './schema.ts';

// No extension interface needed - ensureSiteTokenEncryptionKey only
// ever does a single find('singleton')/save(), the plain Store<T>
// shape. Mirrors postgres/session-secret-store.ts exactly.
export function openPostgresSiteTokenEncryptionKeyStore(db: Db): Store<SiteTokenEncryptionKeyRecord> {
  return {
    async list() {
      return (await db.select().from(siteTokenEncryptionKey)) as SiteTokenEncryptionKeyRecord[];
    },
    async find(id) {
      const [row] = await db.select().from(siteTokenEncryptionKey).where(eq(siteTokenEncryptionKey.id, id));
      return row as SiteTokenEncryptionKeyRecord | undefined;
    },
    async save(record) {
      await db
        .insert(siteTokenEncryptionKey)
        .values(record)
        .onConflictDoUpdate({ target: siteTokenEncryptionKey.id, set: record });
    },
    async delete(id) {
      await db.delete(siteTokenEncryptionKey).where(eq(siteTokenEncryptionKey.id, id));
    },
  };
}
