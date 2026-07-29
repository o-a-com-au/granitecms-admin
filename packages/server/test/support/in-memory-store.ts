import type { Store } from '../../src/store/store.ts';

// Test-only: the real job of the Store interface (packages/server/src/store/store.ts)
// is letting route/service tests avoid touching disk at all.
export function openInMemoryStore<T extends { id: string }>(): Store<T> {
  const records = new Map<string, T>();

  return {
    async list() {
      return [...records.values()];
    },
    async find(id) {
      return records.get(id);
    },
    async save(record) {
      records.set(record.id, record);
    },
    async delete(id) {
      records.delete(id);
    },
  };
}
