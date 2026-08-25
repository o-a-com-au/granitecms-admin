import type { SiteTokenEncryptionKeyRecord } from '../../sites/site-token-encryption-key.ts';
import type { Store } from '../store.ts';
import type { SqliteDb } from './client.ts';
import { openSqliteStore } from './generic-store.ts';

// No extension interface needed, mirrors postgres/site-token-encryption-key-store.ts
// exactly - ensureSiteTokenEncryptionKey only ever does a single
// find('singleton')/save().
export function openSqliteSiteTokenEncryptionKeyStore(db: SqliteDb): Store<SiteTokenEncryptionKeyRecord> {
  return openSqliteStore<SiteTokenEncryptionKeyRecord>(db, 'site_token_encryption_key');
}
