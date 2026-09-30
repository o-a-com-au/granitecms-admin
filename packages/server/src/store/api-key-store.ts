import type { ApiKey } from '../api-keys/api-key.ts';
import type { Store } from './store.ts';
import { openInMemoryStore } from './in-memory-store.ts';

export interface ApiKeyStore extends Store<ApiKey> {
  listByUser(userId: string): Promise<ApiKey[]>;
}

export function openInMemoryApiKeyStore(): ApiKeyStore {
  const base = openInMemoryStore<ApiKey>();
  return {
    ...base,
    async listByUser(userId) {
      return (await base.list()).filter((key) => key.userId === userId);
    },
  };
}
