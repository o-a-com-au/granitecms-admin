// Sets a developer account's plan by hand, until billing exists:
//
//   npm run set-plan -- someone@example.com pro
//   npm run set-plan -- someone@example.com free
//
// Uses the same storage as the server (Postgres when DATABASE_URL is
// set, otherwise the local SQLite file), so run it where the admin runs.
// Pro is what AI agent access (API keys) needs on a site's owner.
import { loadConfig } from '../config.ts';
import { openDb } from '../store/postgres/client.ts';
import { openPostgresUserStore } from '../store/postgres/user-store.ts';
import { openSqliteDb } from '../store/sqlite/client.ts';
import { openSqliteUserStore } from '../store/sqlite/user-store.ts';
import { planOf, type AdminUserPlan } from '../auth/users.ts';

const [email, plan] = process.argv.slice(2);
if (!email || (plan !== 'free' && plan !== 'pro')) {
  console.error('Usage: npm run set-plan -- <email> <free|pro>');
  process.exit(1);
}

const config = loadConfig();
let close: () => Promise<void>;
let usersStore;
if (config.storageDriver === 'postgres') {
  const db = openDb(config.databaseUrl);
  usersStore = openPostgresUserStore(db);
  close = async () => {
    await db.$client.end();
  };
} else {
  const db = openSqliteDb(config.sqlitePath);
  usersStore = openSqliteUserStore(db);
  close = async () => {
    db.close();
  };
}

try {
  const user = await usersStore.findByEmail(email);
  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exitCode = 1;
  } else if (user.role !== 'developer') {
    console.error(`${email} is a client account. Plans belong to developer accounts, which own sites.`);
    process.exitCode = 1;
  } else {
    const before = planOf(user);
    await usersStore.save({ ...user, plan: plan as AdminUserPlan });
    console.log(`${email}: ${before} -> ${plan}`);
  }
} finally {
  await close();
}
