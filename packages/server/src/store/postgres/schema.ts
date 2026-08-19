import { sql } from 'drizzle-orm';
import { pgTable, text, uniqueIndex, index } from 'drizzle-orm/pg-core';

// One table per former JSON store - shapes taken verbatim from the
// AdminUser/Site/SiteAccess/SiteInvite/SessionSecretRecord interfaces,
// no changes beyond the storage engine. No `sessions` table: session
// data lives in Redis instead (store/redis-session-store.ts), not
// Postgres - see that file's own comment for why.

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordSalt: text('password_salt').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    // `enum` here is a TS-level narrowing only (still a plain text
    // column, not a real Postgres enum type) - matches AdminUserRole/
    // AdminUserStatus exactly, so select results type as AdminUser
    // without a cast.
    role: text('role', { enum: ['developer', 'client'] }).notNull(),
    status: text('status', { enum: ['active', 'paused'] }).notNull(),
    timezone: text('timezone').notNull(),
    createdAt: text('created_at').notNull(),
  },
  // Case-insensitive - matches how every route currently deduplicates
  // (normaliseUsername(email), auth/users.ts) before comparing. A
  // plain index on the raw column wouldn't be usable by a lower()-
  // wrapped lookup query.
  (table) => [uniqueIndex('users_email_idx').on(sql`lower(${table.email})`)],
);

export const sites = pgTable(
  'sites',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    token: text('token').notNull(),
    ownerId: text('owner_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('sites_owner_id_idx').on(table.ownerId)],
);

export const siteAccess = pgTable(
  'site_access',
  {
    id: text('id').primaryKey(), // deterministic `${userId}:${siteId}` - see sites/site-access.ts
    userId: text('user_id').notNull(),
    siteId: text('site_id').notNull(),
    grantedAt: text('granted_at').notNull(),
  },
  (table) => [index('site_access_user_id_idx').on(table.userId), index('site_access_site_id_idx').on(table.siteId)],
);

export const siteInvites = pgTable(
  'site_invites',
  {
    id: text('id').primaryKey(), // sha256(inviteCode) - see sites/site-invite.ts
    siteId: text('site_id').notNull(),
    email: text('email').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    claimedAt: text('claimed_at'),
    claimedByUserId: text('claimed_by_user_id'),
  },
  (table) => [index('site_invites_site_id_idx').on(table.siteId)],
);

// Always exactly one row (id: 'singleton') - see auth/session-secret.ts.
// Not narrowed to that literal via drizzle's `enum` option the way
// users.role/status are - Store<T>'s own find/delete take a plain
// `id: string`, and a literal-typed column can't satisfy that generic
// signature. The app-level guarantee (ensureSessionSecret always
// writes 'singleton') is enough; the type only needs to be `string`.
export const sessionSecret = pgTable('session_secret', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
});

// Always exactly one row (id: 'singleton') - see
// sites/site-token-encryption-key.ts. Same not-narrowed-to-a-literal
// reasoning as session_secret above.
export const siteTokenEncryptionKey = pgTable('site_token_encryption_key', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
});
