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
  dataDir: string;
  webDistDir: string;
  // The externally-reachable origin this server is deployed at, used
  // only to build OAuth callback URLs (routes/oauth.ts) and invite
  // claim links (routes/site-invites.ts) - never derived from a
  // request's own Host header, which an attacker controls.
  baseUrl: string;
  googleOAuth: OAuthProviderConfig | undefined;
  githubOAuth: OAuthProviderConfig | undefined;
  smtp: SmtpConfig | undefined;
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
// from either location. Resolved from this module's own location,
// not process.cwd(): the built web assets are a fixed sibling of this
// package, not something that varies by deployment the way the data
// directory does (which stays CWD/env-relative, since it genuinely is
// operator configuration).
const DEFAULT_WEB_DIST_DIR = resolve(import.meta.dirname, '../../web/dist');

export function loadConfig(): AdminConfig {
  const port = Number(process.env.PORT ?? 4278);
  const dataDir = resolve(process.env.ADMIN_DATA_DIR ?? 'data');
  const webDistDir = resolve(process.env.ADMIN_WEB_DIST ?? DEFAULT_WEB_DIST_DIR);
  // Falls back to a local dev origin - fine for local OAuth testing
  // against a provider app configured with that exact callback URL,
  // but any real deployment behind a domain must set this explicitly.
  const baseUrl = process.env.ADMIN_BASE_URL ?? `http://localhost:${port}`;
  const googleOAuth = loadProviderConfig('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET');
  const githubOAuth = loadProviderConfig('GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET');
  const smtp = loadSmtpConfig();
  return { port, dataDir, webDistDir, baseUrl, googleOAuth, githubOAuth, smtp };
}
