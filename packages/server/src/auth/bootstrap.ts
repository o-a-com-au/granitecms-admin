import { randomBytes } from 'node:crypto';
import type { Store } from '../store/store.ts';
import type { AdminUser } from './users.ts';
import { normaliseUsername } from './users.ts';
import { hashPassword } from './password.ts';

function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

// No-op once any account exists. Otherwise creates the very first
// admin account from ADMIN_BOOTSTRAP_USERNAME/PASSWORD if both are
// set, or generates both randomly - either way, logs the credentials
// to stdout exactly once via plain console.log, never written to
// disk in plain text. Mirrors the agent repo's own create-site CLI
// precedent ("a real starter auth token is generated... printed
// once"). Deliberately not called from buildServer - it must run
// exactly once per real boot, not on every test's buildServer() call.
export async function ensureBootstrapAdmin(usersStore: Store<AdminUser>): Promise<void> {
  const existing = await usersStore.list();
  if (existing.length > 0) {
    return;
  }

  const username = process.env.ADMIN_BOOTSTRAP_USERNAME ?? 'admin';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? generatePassword();

  const { hash, salt } = hashPassword(password);
  const id = normaliseUsername(username);
  await usersStore.save({
    id,
    username,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  });

  console.log('');
  console.log('No admin account existed yet - created one:');
  console.log(`  username: ${username}`);
  console.log(`  password: ${password}`);
  console.log('This is shown once and is not stored in plain text anywhere. Save it now.');
  console.log('');
}
