import { resolve } from 'node:path';

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

export interface AdminConfig {
  port: number;
  webDistDir: string;
  // The externally-reachable origin this server is deployed at, used
  // only to build OAuth callback URLs (routes/oauth.ts) and invite
  // claim links (routes/site-invites.ts) - never derived from a
  // request's own Host header, which an attacker controls.
  baseUrl: string;
  googleOAuth: OAuthProviderConfig | undefined;
  githubOAuth: OAuthProviderConfig | undefined;
  smtp: SmtpConfig | undefined;
  // Required, not optional-with-fallback like smtp/oauth above -
  // there is no working degraded state without a database or session
  // store, unlike an unconfigured mailer or OAuth provider.
  databaseUrl: string;
  redisUrl: string;
  // Passed straight to Fastify's own trustProxy option (proxy-addr
  // syntax: a specific IP/CIDR, or the literal presets 'loopback'/
  // 'linklocal'/'uniquelocal') - false by default, same as Fastify's
  // own default and the sibling agent repo's site.config.json
  // trustProxy field. Needed for the session cookie's secure: 'auto'
  // (server.ts) to see the real client protocol correctly once a
  // reverse proxy terminates TLS in front of this process - set it to
  // exactly where that proxy actually is, never blanket `true` unless
  // this process is genuinely unreachable except through it.
  trustProxy: string | boolean;
}

function loadProviderConfig(clientIdVar: string, clientSecretVar: string): OAuthProviderConfig | undefined {
  const clientId = process.env[clientIdVar];
  const clientSecret = process.env[clientSecretVar];
  if (!clientId || !clientSecret) {
    return undefined;
  }
  return { clientId, clientSecret };
}

// All-or-nothing, same pattern as loadProviderConfig - unconfigured is
// a first-class, fully supported state (email/mailer.ts's
// createMailer degrades to undefined, never a hard failure), not
// something that needs partial-config validation.
function loadSmtpConfig(): SmtpConfig | undefined {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || !port || !user || !password || !from) {
    return undefined;
  }
  return { host, port: Number(port), user, password, from };
}

// packages/server/src/config.ts (dev, run directly) and
// packages/server/dist/config.js (built) both sit exactly two
// directories under packages/, so '../../web/dist' resolves correctly
// from either location. Resolved from this module's own location, not
// process.cwd() - the built web assets are a fixed sibling of this
// package.
const DEFAULT_WEB_DIST_DIR = resolve(import.meta.dirname, '../../web/dist');

export function loadConfig(): AdminConfig {
  const port = Number(process.env.PORT ?? 4278);
  const webDistDir = resolve(process.env.ADMIN_WEB_DIST ?? DEFAULT_WEB_DIST_DIR);
  // Falls back to a local dev origin - fine for local OAuth testing
  // against a provider app configured with that exact callback URL,
  // but any real deployment behind a domain must set this explicitly.
  const baseUrl = process.env.ADMIN_BASE_URL ?? `http://localhost:${port}`;
  const googleOAuth = loadProviderConfig('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET');
  const githubOAuth = loadProviderConfig('GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET');
  const smtp = loadSmtpConfig();
  // Default matches docker-compose.yml's local Postgres/Redis exactly
  // - same convenience-default pattern as baseUrl/webDistDir above,
  // not a "gracefully degraded" state (there isn't one here). A real
  // deployment always needs its own managed Postgres/Redis regardless,
  // so there's no accidental-production-fallback risk the way an
  // unset SMTP config would have.
  const databaseUrl = process.env.DATABASE_URL ?? 'postgres://admin:admin@localhost:5432/cms_admin';
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const trustProxyEnv = process.env.TRUST_PROXY;
  const trustProxy: string | boolean = trustProxyEnv === 'true' ? true : (trustProxyEnv ?? false);
  return { port, webDistDir, baseUrl, googleOAuth, githubOAuth, smtp, databaseUrl, redisUrl, trustProxy };
}
