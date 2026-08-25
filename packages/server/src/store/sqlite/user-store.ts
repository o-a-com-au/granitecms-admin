import type { AdminUser } from '../../auth/users.ts';
import { normaliseUsername } from '../../auth/users.ts';
import type { UserStore } from '../user-store.ts';
import type { SqliteDb } from './client.ts';
import { openSqliteStore } from './generic-store.ts';

// Mirrors openInMemoryUserStore exactly (store/user-store.ts) - the same
// list()-then-filter approach, backed by a real persisted table instead
// of a Map.
export function openSqliteUserStore(db: SqliteDb): UserStore {
  const base = openSqliteStore<AdminUser>(db, 'users');
  return {
    ...base,
    async findByEmail(email) {
      const normalised = normaliseUsername(email);
      const users = await base.list();
      return users.find((user) => normaliseUsername(user.email) === normalised);
    },
  };
}
