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
  createdAt: string;
}

// The id is the normalised username itself, so Store<AdminUser>.find(id)
// is a direct lookup - no need to extend Store with a query method for
// this one case.
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}
