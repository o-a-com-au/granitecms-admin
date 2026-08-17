import { createHash } from 'node:crypto';

// Locked to the email the developer entered at creation - the claim
// step (routes/site-invites.ts) is reached by an unauthenticated
// visitor, so it checks this against whatever email they claim with.
export interface SiteInvite {
  id: string;
  siteId: string;
  email: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  claimedByUserId: string | null;
}

export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// A high-entropy random bearer token (auth/password.ts's own
// generatePassword()), not a low-entropy human-chosen password -
// sha256 is the right tool here, same as the sibling agent repo's own
// site API token (generate-site.ts's generateToken()), not scrypt
// (which exists to slow down brute-forcing a guessable value, not to
// protect an already-unguessable one).
//
// The id is this hash, not a random id - a direct Store.find(id)
// lookup at claim time, the same "id is a derived key" convention
// AdminUser.id/SiteAccess.id already use.
export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
