import type { AdminUser } from '../auth/users.ts';
import { normaliseUsername } from '../auth/users.ts';
import type { Store } from './store.ts';
import { openInMemoryStore } from './in-memory-store.ts';

// The one indexed lookup every email-uniqueness check needs
// (routes/auth.ts, oauth.ts, site-users.ts, site-invites.ts) -
// case-insensitive, matching normaliseUsername's own trim+lowercase,
// which every one of those call sites already applies before
// comparing.
export interface UserStore extends Store<AdminUser> {
  findByEmail(email: string): Promise<AdminUser | undefined>;
}

// Naive linear scan over list() - fine for tests and for
// buildServer's default deps, same "not a real production store"
// caveat openInMemoryStore's own comment already states. The Postgres
// implementation (store/postgres/user-store.ts) does the real indexed
// query.
export function openInMemoryUserStore(): UserStore {
  const base = openInMemoryStore<AdminUser>();
  return {
    ...base,
    async findByEmail(email) {
      const normalised = normaliseUsername(email);
      const users = await base.list();
      return users.find((user) => normaliseUsername(user.email) === normalised);
    },
  };
}
