import { resolve } from 'node:path';

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
}

export interface AdminConfig {
  port: number;
  dataDir: string;
  webDistDir: string;
  // The externally-reachable origin this server is deployed at, used
  // only to build OAuth callback URLs (routes/oauth.ts) - never
  // derived from a request's own Host header, which an attacker
  // controls.
  baseUrl: string;
  googleOAuth: OAuthProviderConfig | undefined;
  githubOAuth: OAuthProviderConfig | undefined;
}

function loadProviderConfig(clientIdVar: string, clientSecretVar: string): OAuthProviderConfig | undefined {
  const clientId = process.env[clientIdVar];
  const clientSecret = process.env[clientSecretVar];
  if (!clientId || !clientSecret) {
    return undefined;
  }
  return { clientId, clientSecret };
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
  return { port, dataDir, webDistDir, baseUrl, googleOAuth, githubOAuth };
}
