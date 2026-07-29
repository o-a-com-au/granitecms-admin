import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureBootstrapAdmin } from '../../src/auth/bootstrap.ts';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';
import { normaliseUsername, type AdminUser } from '../../src/auth/users.ts';
import { verifyPassword } from '../../src/auth/password.ts';

describe('bootstrap', () => {
  const originalUsername = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const originalPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  beforeEach(() => {
    delete process.env.ADMIN_BOOTSTRAP_USERNAME;
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
  });

  afterEach(() => {
    if (originalUsername === undefined) {
      delete process.env.ADMIN_BOOTSTRAP_USERNAME;
    } else {
      process.env.ADMIN_BOOTSTRAP_USERNAME = originalUsername;
    }
    if (originalPassword === undefined) {
      delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
    } else {
      process.env.ADMIN_BOOTSTRAP_PASSWORD = originalPassword;
    }
  });

  it('creates a default "admin" account with a generated password when the store is empty and no env vars are set', async (t) => {
    const logSpy = t.mock.method(console, 'log', () => {});
    const usersStore = openInMemoryStore<AdminUser>();

    await ensureBootstrapAdmin(usersStore);

    const user = await usersStore.find(normaliseUsername('admin'));
    assert.ok(user, 'expected an admin user to be created');
    assert.equal(user?.username, 'admin');

    const loggedOutput = logSpy.mock.calls.map((call) => String(call.arguments[0])).join('\n');
    assert.match(loggedOutput, /admin/);
    assert.match(loggedOutput, /shown once/);
  });

  it('uses ADMIN_BOOTSTRAP_USERNAME/PASSWORD when both are set', async (t) => {
    t.mock.method(console, 'log', () => {});
    process.env.ADMIN_BOOTSTRAP_USERNAME = 'agencyLead';
    process.env.ADMIN_BOOTSTRAP_PASSWORD = 'a-real-chosen-password';
    const usersStore = openInMemoryStore<AdminUser>();

    await ensureBootstrapAdmin(usersStore);

    const user = await usersStore.find(normaliseUsername('agencyLead'));
    assert.ok(user, 'expected the env-var-named admin user to be created');
    assert.equal(verifyPassword('a-real-chosen-password', user!.passwordHash, user!.passwordSalt), true);
  });

  it('is a no-op when the users store is already non-empty and already has a name/email', async (t) => {
    const logSpy = t.mock.method(console, 'log', () => {});
    const usersStore = openInMemoryStore<AdminUser>();
    await usersStore.save({
      id: 'existing',
      username: 'existing',
      passwordHash: 'x',
      passwordSalt: 'y',
      name: 'Existing Person',
      email: 'existing@example.com',
      createdAt: new Date().toISOString(),
    });

    await ensureBootstrapAdmin(usersStore);

    assert.deepEqual(await usersStore.list(), [
      {
        id: 'existing',
        username: 'existing',
        passwordHash: 'x',
        passwordSalt: 'y',
        name: 'Existing Person',
        email: 'existing@example.com',
        createdAt: (await usersStore.find('existing'))!.createdAt,
      },
    ]);
    assert.equal(logSpy.mock.calls.length, 0, 'must not log or create a second account');
  });

  it('quietly backfills name/email on an existing user missing them, without creating a second account or logging', async (t) => {
    const logSpy = t.mock.method(console, 'log', () => {});
    const usersStore = openInMemoryStore<AdminUser>();
    await usersStore.save({
      id: 'existing',
      username: 'existing',
      passwordHash: 'x',
      passwordSalt: 'y',
      name: '',
      email: '',
      createdAt: new Date().toISOString(),
    } as AdminUser);

    await ensureBootstrapAdmin(usersStore);

    const users = await usersStore.list();
    assert.equal(users.length, 1, 'must not create a second account');
    assert.equal(users[0]?.name, 'existing');
    assert.equal(users[0]?.email, 'existing@admin.local');
    assert.equal(logSpy.mock.calls.length, 0, 'a quiet migration, not a fresh-account event');
  });
});
