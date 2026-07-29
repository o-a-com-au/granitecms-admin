export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

// The id is the normalised username itself, so Store<AdminUser>.find(id)
// is a direct lookup - no need to extend Store with a query method for
// this one case.
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}
