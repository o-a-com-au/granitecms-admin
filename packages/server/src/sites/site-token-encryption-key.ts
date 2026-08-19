import { randomBytes } from 'node:crypto';
import type { Store } from '../store/store.ts';

export interface SiteTokenEncryptionKeyRecord {
  id: 'singleton';
  key: string; // base64, 32 bytes decoded (AES-256)
}

// Same pattern as auth/session-secret.ts's ensureSessionSecret, and
// for the same reason: a random-per-boot key here would make every
// already-encrypted Site.token undecryptable on the next restart.
// SITE_TOKEN_ENCRYPTION_KEY always wins when set (a real deployment's
// own secrets-manager entry); otherwise the first generated value is
// persisted through Store, same as every other piece of admin state.
//
// Deliberately not given a hardcoded fallback the way DATABASE_URL/
// REDIS_URL are (config.ts) - those aren't secrets that protect data
// confidentiality on their own, so a shared dev-convenience default is
// harmless; a shared default encryption key would mean every
// deployment that forgot to override it shares the same key, which
// this generate-and-persist approach avoids entirely while still
// needing zero manual setup.
export async function ensureSiteTokenEncryptionKey(store: Store<SiteTokenEncryptionKeyRecord>): Promise<Buffer> {
  const envKey = process.env.SITE_TOKEN_ENCRYPTION_KEY;
  if (envKey) {
    return Buffer.from(envKey, 'base64');
  }

  const existing = await store.find('singleton');
  if (existing) {
    return Buffer.from(existing.key, 'base64');
  }

  const key = randomBytes(32);
  await store.save({ id: 'singleton', key: key.toString('base64') });
  return key;
}
