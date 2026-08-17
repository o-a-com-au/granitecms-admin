// The client-grant join - represents "this client user can access this
// specific site." Only ever created for role: 'client' accounts; a
// developer's access to their own sites is implicit via Site.ownerId,
// no row here at all.
export interface SiteAccess {
  id: string;
  userId: string;
  siteId: string;
  grantedAt: string;
}

// A deterministic composite id, not a random UUID - makes "does this
// client have access to this site" a single Store.find(id) call, and
// makes re-granting the same access idempotent (same key = same
// record) for free, rather than a separate uniqueness check.
//
// siteId is always randomUUID() (routes/sites.ts) and never contains
// ':', so this concatenation can't collide even though userId (an
// arbitrary developer-chosen username, normaliseUsername'd - see
// auth/users.ts) has no character allowlist of its own.
export function siteAccessId(userId: string, siteId: string): string {
  return `${userId}:${siteId}`;
}
