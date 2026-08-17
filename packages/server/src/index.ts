import { join } from 'node:path';
import { buildServer } from './server.ts';
import { loadConfig } from './config.ts';
import { openJsonFileStore } from './store/json-file-store.ts';
import { ensureSessionSecret } from './auth/session-secret.ts';
import type { SessionSecretRecord } from './auth/session-secret.ts';
import { ensureBootstrapAdmin } from './auth/bootstrap.ts';
import type { AdminUser } from './auth/users.ts';
import type { SessionRecord } from './auth/session-store-adapter.ts';
import type { Site } from './sites/site.ts';
import type { SiteAccess } from './sites/site-access.ts';
import type { SiteInvite } from './sites/site-invite.ts';
import { backfillSiteOwnership } from './sites/site-ownership-backfill.ts';
import { createGoogleProvider } from './auth/oauth-google.ts';
import { createGithubProvider } from './auth/oauth-github.ts';
import type { OAuthProvider } from './auth/oauth-provider.ts';
import { createMailer } from './email/mailer.ts';

const config = loadConfig();

const usersStore = openJsonFileStore<AdminUser>(join(config.dataDir, 'users.json'));
const sessionSecretStore = openJsonFileStore<SessionSecretRecord>(join(config.dataDir, 'session-secret.json'));
const sessionRecordStore = openJsonFileStore<SessionRecord>(join(config.dataDir, 'sessions.json'));
const sitesStore = openJsonFileStore<Site>(join(config.dataDir, 'sites.json'));
const siteAccessStore = openJsonFileStore<SiteAccess>(join(config.dataDir, 'site-access.json'));
const siteInviteStore = openJsonFileStore<SiteInvite>(join(config.dataDir, 'site-invites.json'));

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
