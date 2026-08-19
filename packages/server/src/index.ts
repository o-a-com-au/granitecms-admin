import { Redis } from 'ioredis';
import { buildServer } from './server.ts';
import { loadConfig } from './config.ts';
import { openDb } from './store/postgres/client.ts';
import { openPostgresUserStore } from './store/postgres/user-store.ts';
import { openPostgresSiteStore } from './store/postgres/site-store.ts';
import { openPostgresSiteAccessStore } from './store/postgres/site-access-store.ts';
import { openPostgresSiteInviteStore } from './store/postgres/site-invite-store.ts';
import { openPostgresSessionSecretStore } from './store/postgres/session-secret-store.ts';
import { openRedisSessionStore } from './store/redis-session-store.ts';
import { ensureSessionSecret } from './auth/session-secret.ts';
import { ensureBootstrapAdmin } from './auth/bootstrap.ts';
import { backfillSiteOwnership } from './sites/site-ownership-backfill.ts';
import { createGoogleProvider } from './auth/oauth-google.ts';
import { createGithubProvider } from './auth/oauth-github.ts';
import type { OAuthProvider } from './auth/oauth-provider.ts';
import { createMailer } from './email/mailer.ts';

const config = loadConfig();
const db = openDb(config.databaseUrl);
const redis = new Redis(config.redisUrl);

const usersStore = openPostgresUserStore(db);
const sessionSecretStore = openPostgresSessionSecretStore(db);
const sessionRecordStore = openRedisSessionStore(redis);
const sitesStore = openPostgresSiteStore(db);
const siteAccessStore = openPostgresSiteAccessStore(db);
const siteInviteStore = openPostgresSiteInviteStore(db);

const sessionSecret = await ensureSessionSecret(sessionSecretStore);
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
