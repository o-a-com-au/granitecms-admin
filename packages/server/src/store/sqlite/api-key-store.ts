import type { ApiKey } from '../../api-keys/api-key.ts';
import type { ApiKeyStore } from '../api-key-store.ts';
import type { SqliteDb } from './client.ts';
import { openSqliteStore } from './generic-store.ts';

export function openSqliteApiKeyStore(db: SqliteDb): ApiKeyStore {
  const base = openSqliteStore<ApiKey>(db, 'api_keys');
  return {
    ...base,
    async listByUser(userId) {
      return (await base.list()).filter((key) => key.userId === userId);
    },
  };
}
