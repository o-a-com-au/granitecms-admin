import type { Store } from '../store/store.ts';
import type { AdminUser } from './users.ts';
import { normaliseUsername } from './users.ts';
import { generatePassword, hashPassword } from './password.ts';
import { DEFAULT_TIMEZONE } from './timezone.ts';
import { formatFullName, splitFullName } from './full-name.ts';

// A user record from before firstName/lastName/email/role/status/
// timezone existed would otherwise carry undefined at keys the type
// now claims are always set - backfilled quietly (no log, no new
// account) so upgrading an existing deployment never leaves an
// invalid record on disk. ADMIN_BOOTSTRAP_FIRST_NAME/LAST_NAME/EMAIL
// are deliberately not consulted here - those are for the one account
// actually being freshly created below, not for patching a different,
// already-named account. Every pre-existing account defaults to role:
// 'developer' - historically the only account type had full
// capability, which is what today's developer role represents; status
// defaults to 'active' since pausing is a new, deliberate action no
// existing account could have taken yet. timezone defaults to
// DEFAULT_TIMEZONE - no browser signal exists for an account that
// already existed before this field did.
//
// Guarded on typeof lastName !== 'string', not truthiness - an
// already-migrated account can legitimately have lastName: '' (a
// single-word name splits with nothing left over), which must not be
// re-migrated on every single boot.
async function backfillMissingIdentity(usersStore: Store<AdminUser>, users: AdminUser[]): Promise<void> {
  for (const user of users) {
    if (
      user.firstName &&
      typeof user.lastName === 'string' &&
      user.email &&
      user.role &&
      user.status &&
      user.timezone
    ) {
      continue;
    }
    // A record from before this field was split still carries a
    // single combined `name` on disk - not part of the AdminUser type
    // any more, so read it defensively and explicitly reconstruct the
    // saved record rather than spreading `...user`, which would leave
    // that stale key sitting in the JSON store forever alongside the
    // new firstName/lastName.
    const record = user as unknown as AdminUser & { name?: string };
    const { firstName, lastName } = record.firstName
      ? { firstName: record.firstName, lastName: record.lastName ?? '' }
      : splitFullName(record.name || record.username);
    await usersStore.save({
      id: record.id,
      username: record.username,
      passwordHash: record.passwordHash,
      passwordSalt: record.passwordSalt,
      firstName,
      lastName,
      email: record.email || `${record.id}@admin.local`,
      role: record.role ?? 'developer',
      status: record.status ?? 'active',
      timezone: record.timezone || DEFAULT_TIMEZONE,
      createdAt: record.createdAt,
    });
  }
}

// No-op (beyond the backfill above) once any account exists. Otherwise
// creates the very first admin account from
// ADMIN_BOOTSTRAP_USERNAME/PASSWORD/FIRST_NAME/LAST_NAME/EMAIL if set,
// or generates/derives them - either way, logs the credentials to
// stdout exactly once via plain console.log, never written to disk in
// plain text. Mirrors the agent repo's own create-site CLI precedent
// ("a real starter auth token is generated... printed once").
// Deliberately not called from buildServer - it must run exactly once
// per real boot, not on every test's buildServer() call.
export async function ensureBootstrapAdmin(usersStore: Store<AdminUser>): Promise<void> {
  const existing = await usersStore.list();
  if (existing.length > 0) {
    await backfillMissingIdentity(usersStore, existing);
    return;
  }

  const username = process.env.ADMIN_BOOTSTRAP_USERNAME ?? 'admin';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? generatePassword();
  const id = normaliseUsername(username);
  const firstName = process.env.ADMIN_BOOTSTRAP_FIRST_NAME ?? username;
  const lastName = process.env.ADMIN_BOOTSTRAP_LAST_NAME ?? '';
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL ?? `${id}@admin.local`;

  const { hash, salt } = hashPassword(password);
  await usersStore.save({
    id,
    username,
    passwordHash: hash,
    passwordSalt: salt,
    firstName,
    lastName,
    email,
    role: 'developer',
    status: 'active',
    timezone: DEFAULT_TIMEZONE,
    createdAt: new Date().toISOString(),
  });

  console.log('');
  console.log('No admin account existed yet - created one:');
  console.log(`  username: ${username}`);
  console.log(`  password: ${password}`);
  console.log(`  commit author: ${formatFullName(firstName, lastName)} <${email}>`);
  console.log('This is shown once and is not stored in plain text anywhere. Save it now.');
  console.log('');
}
