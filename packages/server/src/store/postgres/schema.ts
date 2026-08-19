import { pgTable, text, uniqueIndex, index } from 'drizzle-orm/pg-core';

// One table per existing JSON store (store/json-file-store.ts, being
// retired) - shapes taken verbatim from the AdminUser/Site/SiteAccess/
// SiteInvite/SessionSecretRecord interfaces, no changes beyond the
// storage engine. No `sessions` table: session data lives in Redis
// instead (auth/redis-session-store.ts), not Postgres - see that
// file's own comment for why.

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
    role: text('role').notNull(), // AdminUserRole: 'developer' | 'client'
    status: text('status').notNull(), // AdminUserStatus: 'active' | 'paused'
    timezone: text('timezone').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('users_email_idx').on(table.email)],
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
export const sessionSecret = pgTable('session_secret', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
});
