import type { Site } from '../../sites/site.ts';
import { encryptSiteToken, decryptSiteToken } from '../../sites/site-token-crypto.ts';
import type { SiteStore } from '../site-store.ts';
import type { SqliteDb } from './client.ts';
import { openSqliteStore } from './generic-store.ts';

// Mirrors store/postgres/site-store.ts's encrypt-on-write/decrypt-on-read
// wrapping exactly, and store/site-store.ts's openInMemorySiteStore for
// listByOwner - the only difference is the underlying persistence.
function decryptRow(row: Site, key: Buffer): Site {
  return { ...row, token: decryptSiteToken(row.token, key) };
}

export function openSqliteSiteStore(db: SqliteDb, encryptionKey: Buffer): SiteStore {
  const base = openSqliteStore<Site>(db, 'sites');
  return {
    async list() {
      const rows = await base.list();
      return rows.map((row) => decryptRow(row, encryptionKey));
    },
    async find(id) {
      const row = await base.find(id);
      return row ? decryptRow(row, encryptionKey) : undefined;
    },
    async save(record) {
      await base.save({ ...record, token: encryptSiteToken(record.token, encryptionKey) });
    },
    async delete(id) {
      await base.delete(id);
    },
    async listByOwner(ownerId) {
      const rows = await base.list();
      return rows.filter((site) => site.ownerId === ownerId).map((row) => decryptRow(row, encryptionKey));
    },
  };
}
