// developer: registers/configures sites, invites clients. client: full
// content-editing capability (publish, revert, history, media,
// redirects - parity with a developer), but only on the specific
// site(s) explicitly granted via a SiteAccess row (site-access.ts) -
// never inherited from the inviting developer's whole portfolio.
export type AdminUserRole = 'developer' | 'client';

// paused blocks ordinary admin access entirely (requireAuth) but never
// touches the published site itself - the agent serves that directly,
// independent of whether anyone can log into this admin at all. Purely
// self-directed: an account pauses/resumes only itself (require-auth.ts's
// requireSession/routes/auth.ts's pause/resume routes).
export type AdminUserStatus = 'active' | 'paused';

export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  // The commit author identity used for every publish/unpublish this
  // account performs (Phase 3 Group G) - set once at bootstrap, never
  // typed fresh per publish, so a real git history gets a stable,
  // real-looking identity rather than something re-entered each time.
  name: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  createdAt: string;
}

// The id is the normalised username itself, so Store<AdminUser>.find(id)
// is a direct lookup - no need to extend Store with a query method for
// this one case.
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}
