import { eq } from 'drizzle-orm';
import type { ApiKey } from '../../api-keys/api-key.ts';
import type { ApiKeyStore } from '../api-key-store.ts';
import type { Db } from './client.ts';
import { apiKeys } from './schema.ts';

export function openPostgresApiKeyStore(db: Db): ApiKeyStore {
  return {
    async list() {
      return db.select().from(apiKeys);
    },
    async find(id) {
      const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
      return row;
    },
    async save(record: ApiKey) {
      await db.insert(apiKeys).values(record).onConflictDoUpdate({ target: apiKeys.id, set: record });
    },
    async delete(id) {
      await db.delete(apiKeys).where(eq(apiKeys.id, id));
    },
    async listByUser(userId) {
      return db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
    },
  };
}
