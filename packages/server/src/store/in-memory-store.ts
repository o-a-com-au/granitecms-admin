import type { Store } from './store.ts';

// A real, minimal ephemeral implementation, not test-only: used as
// buildServer's default deps (see server.ts) for tests and ad hoc
// runs. Real production boot (index.ts) always constructs and passes
// real JSON-file-backed stores explicitly - it never relies on this
// default, since an in-memory store loses every session and account
// on restart.
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
