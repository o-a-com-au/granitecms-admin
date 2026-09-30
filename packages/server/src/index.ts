import { Redis } from 'ioredis';
import * as Sentry from '@sentry/node';
import { buildServer } from './server.ts';
import { loadConfig } from './config.ts';
import { openDb } from './store/postgres/client.ts';
import { openPostgresUserStore } from './store/postgres/user-store.ts';
import { openPostgresSiteStore } from './store/postgres/site-store.ts';
import { openPostgresSiteAccessStore } from './store/postgres/site-access-store.ts';
import { openPostgresSiteInviteStore } from './store/postgres/site-invite-store.ts';
import { openPostgresSessionSecretStore } from './store/postgres/session-secret-store.ts';
import { openPostgresSiteTokenEncryptionKeyStore } from './store/postgres/site-token-encryption-key-store.ts';
import { openRedisSessionStore } from './store/redis-session-store.ts';
import { openSqliteDb } from './store/sqlite/client.ts';
import { openSqliteUserStore } from './store/sqlite/user-store.ts';
import { openSqliteSiteStore } from './store/sqlite/site-store.ts';
import { openSqliteSiteAccessStore } from './store/sqlite/site-access-store.ts';
import { openSqliteSiteInviteStore } from './store/sqlite/site-invite-store.ts';
import { openSqliteSessionSecretStore } from './store/sqlite/session-secret-store.ts';
import { openSqliteSiteTokenEncryptionKeyStore } from './store/sqlite/site-token-encryption-key-store.ts';
import { openSqliteSessionStore } from './store/sqlite/session-store.ts';
import type { Store } from './store/store.ts';
import type { UserStore } from './store/user-store.ts';
import type { SiteStore } from './store/site-store.ts';
import type { SiteAccessStore } from './store/site-access-store.ts';
import type { SiteInviteStore } from './store/site-invite-store.ts';
import type { SessionSecretRecord } from './auth/session-secret.ts';
import type { SiteTokenEncryptionKeyRecord } from './sites/site-token-encryption-key.ts';
import type { SessionRecord } from './auth/session-store-adapter.ts';
import { ensureSessionSecret } from './auth/session-secret.ts';
import { ensureSiteTokenEncryptionKey } from './sites/site-token-encryption-key.ts';
import { ensureBootstrapAdmin } from './auth/bootstrap.ts';
import { backfillSiteOwnership } from './sites/site-ownership-backfill.ts';
import { createGoogleProvider } from './auth/oauth-google.ts';
import { createGithubProvider } from './auth/oauth-github.ts';
import type { OAuthProvider } from './auth/oauth-provider.ts';
import { createMailer } from './email/mailer.ts';

const config = loadConfig();

// Unconfigured (no SENTRY_DSN) is a first-class, fully supported state
// - server.ts's error handler calls Sentry.captureException
// unconditionally, which safely no-ops when init() was never called.
if (config.sentryDsn) {
  Sentry.init({ dsn: config.sentryDsn });
}

// storageDriver picks which real, persistent implementation of every
// Store<T> gets constructed - 'sqlite' (default, no DATABASE_URL) needs
// no external service at all; 'postgres' (DATABASE_URL set) is the same
// stack this repo has always used. Everything from here on only ever
// depends on the Store<T> interfaces, never on which branch ran.
let usersStore: UserStore;
let sessionSecretStore: Store<SessionSecretRecord>;
let siteTokenEncryptionKeyStore: Store<SiteTokenEncryptionKeyRecord>;
let sessionRecordStore: Store<SessionRecord>;
let siteAccessStore: SiteAccessStore;
let siteInviteStore: SiteInviteStore;
let makeSitesStore: (encryptionKey: Buffer) => SiteStore;
let closeStorage: () => Promise<void>;

if (config.storageDriver === 'postgres') {
  const db = openDb(config.databaseUrl);
  const redis = new Redis(config.redisUrl);

  usersStore = openPostgresUserStore(db);
  sessionSecretStore = openPostgresSessionSecretStore(db);
  siteTokenEncryptionKeyStore = openPostgresSiteTokenEncryptionKeyStore(db);
  sessionRecordStore = openRedisSessionStore(redis);
  siteAccessStore = openPostgresSiteAccessStore(db);
  siteInviteStore = openPostgresSiteInviteStore(db);
  makeSitesStore = (encryptionKey) => openPostgresSiteStore(db, encryptionKey);
  closeStorage = async () => {
    await db.$client.end();
    redis.disconnect();
  };
} else {
  const sqliteDb = openSqliteDb(config.sqlitePath);

  usersStore = openSqliteUserStore(sqliteDb);
  sessionSecretStore = openSqliteSessionSecretStore(sqliteDb);
  siteTokenEncryptionKeyStore = openSqliteSiteTokenEncryptionKeyStore(sqliteDb);
  sessionRecordStore = openSqliteSessionStore(sqliteDb);
  siteAccessStore = openSqliteSiteAccessStore(sqliteDb);
  siteInviteStore = openSqliteSiteInviteStore(sqliteDb);
  makeSitesStore = (encryptionKey) => openSqliteSiteStore(sqliteDb, encryptionKey);
  closeStorage = async () => {
    sqliteDb.close();
  };
}

const sessionSecret = await ensureSessionSecret(sessionSecretStore);
const siteTokenEncryptionKey = await ensureSiteTokenEncryptionKey(siteTokenEncryptionKeyStore);
const sitesStore = makeSitesStore(siteTokenEncryptionKey);

// Sequenced deliberately: role must be backfilled onto pre-existing
// users before site ownership can be backfilled (it needs role
// populated to find "the earliest developer").
await ensureBootstrapAdmin(usersStore);
await backfillSiteOwnership(usersStore, sitesStore);

// Only the providers with both env vars set are constructed at all -
// an unconfigured provider never gets so much as a route registered
// (server.ts loops over exactly this array), not just a disabled
// button.
const oauthProviders: OAuthProvider[] = [];
if (config.googleOAuth) {
  oauthProviders.push(createGoogleProvider(config.googleOAuth.clientId, config.googleOAuth.clientSecret));
}
if (config.githubOAuth) {
  oauthProviders.push(createGithubProvider(config.githubOAuth.clientId, config.githubOAuth.clientSecret));
}

const mailer = createMailer(config.smtp);

const app = await buildServer(config, {
  usersStore,
  sessionRecordStore,
  sessionSecret,
  sitesStore,
  siteAccessStore,
  siteInviteStore,
  oauthProviders,
  baseUrl: config.baseUrl,
  mailer,
});

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`admin server listening on port ${config.port}`);

// Rolling deploys/restarts (systemd, a container orchestrator, a
// platform's own zero-downtime deploy) send SIGTERM and expect the
// process to stop accepting new connections but let in-flight ones
// finish before exiting - not just die mid-request. app.close()
// already does exactly that (stops the listener, drains in-flight
// requests, then runs every plugin's own onClose hook), so this is
// orchestration, not new drain logic. A self-imposed timeout forces
// exit if something hangs, rather than relying solely on whatever
// kill timeout the platform enforces.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  app.log.info(`received ${signal}, shutting down gracefully`);

  const timeout = setTimeout(() => {
    app.log.warn(`graceful shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timeout.unref();

  try {
    await app.close();
    await closeStorage();
    app.log.info('shutdown complete');
    process.exit(0);
  } catch (error) {
    app.log.error(error, 'error during shutdown');
    process.exit(1);
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
