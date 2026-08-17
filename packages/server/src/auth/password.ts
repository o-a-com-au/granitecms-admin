import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export interface PasswordHash {
  hash: string;
  salt: string;
}

// Shared by bootstrap.ts (the very first admin account) and
// routes/site-users.ts (a developer inviting a client) - a real random
// password shown/returned exactly once, never persisted in plain text.
export function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(candidate, expected);
}

// Used by login so verifyPassword always runs, even for a username
// that doesn't exist - scrypt is deliberately slow, so skipping it
// for an unknown user would leak which field was wrong through
// response timing, not just through the response body (which B2
// already guards against with one shared error message). Computed
// once at module load, not per request.
const dummy = hashPassword(randomBytes(32).toString('hex'));
export const DUMMY_HASH = dummy.hash;
export const DUMMY_SALT = dummy.salt;
