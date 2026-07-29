import { randomBytes } from 'node:crypto';
import type { Store } from '../store/store.ts';

export interface SessionSecretRecord {
  id: 'singleton';
  secret: string;
}

// Without a persisted secret, every restart under `npm run dev`'s
// node --watch would silently invalidate every session on each file
// save. ADMIN_SESSION_SECRET always wins when set; otherwise the
// first generated value is persisted through Store, same as every
// other piece of admin state (never a bare fs write).
export async function ensureSessionSecret(store: Store<SessionSecretRecord>): Promise<string> {
  const envSecret = process.env.ADMIN_SESSION_SECRET;
  if (envSecret) {
    return envSecret;
  }

  const existing = await store.find('singleton');
  if (existing) {
    return existing.secret;
  }

  const secret = randomBytes(48).toString('hex');
  await store.save({ id: 'singleton', secret });
  return secret;
}
