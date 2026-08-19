import { eq, sql } from 'drizzle-orm';
import type { AdminUser } from '../../auth/users.ts';
import { normaliseUsername } from '../../auth/users.ts';
import type { UserStore } from '../user-store.ts';
import type { Db } from './client.ts';
import { users } from './schema.ts';

export function openPostgresUserStore(db: Db): UserStore {
  return {
    async list() {
      return db.select().from(users);
    },
    async find(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row;
    },
    async save(record: AdminUser) {
      await db.insert(users).values(record).onConflictDoUpdate({ target: users.id, set: record });
    },
    async delete(id) {
      await db.delete(users).where(eq(users.id, id));
    },
    async findByEmail(email) {
      const [row] = await db.select().from(users).where(sql`lower(${users.email}) = ${normaliseUsername(email)}`);
      return row;
    },
  };
}
