import { eq } from 'drizzle-orm';
import type { SessionSecretRecord } from '../../auth/session-secret.ts';
import type { Store } from '../store.ts';
import type { Db } from './client.ts';
import { sessionSecret } from './schema.ts';

// No extension interface needed - ensureSessionSecret only ever does
// a single find('singleton')/save(), the plain Store<T> shape.
export function openPostgresSessionSecretStore(db: Db): Store<SessionSecretRecord> {
  return {
    async list() {
      return (await db.select().from(sessionSecret)) as SessionSecretRecord[];
    },
    async find(id) {
      const [row] = await db.select().from(sessionSecret).where(eq(sessionSecret.id, id));
      return row as SessionSecretRecord | undefined;
    },
    async save(record) {
      await db.insert(sessionSecret).values(record).onConflictDoUpdate({ target: sessionSecret.id, set: record });
    },
    async delete(id) {
      await db.delete(sessionSecret).where(eq(sessionSecret.id, id));
    },
  };
}
