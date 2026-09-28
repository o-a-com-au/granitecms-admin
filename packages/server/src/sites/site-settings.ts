import type { Site } from './site.ts';
import type { CommitAuthor } from './commit-author.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

// Site settings (the agent's GET/PUT /v1/settings): values for the
// settings the site's theme defines in theme/config/settings_schema.json.
// Saved like a menu - committed and live at once, no draft.

export interface SiteSettingsPayload {
  // The theme's settings schema, or null when it defines none.
  schema: object | null;
  settings: Record<string, unknown>;
  resolved: Record<string, unknown>;
  // null while the site has no settings saved yet.
  etag: string | null;
}

export type FetchSiteSettingsResult =
  | { outcome: 'ok'; payload: SiteSettingsPayload }
  // The site's CMS is older than site settings (no /v1/settings).
  | { outcome: 'unsupported'; message: string }
  | { outcome: 'unreachable' | 'unauthorized' | 'error'; message: string };

export interface SiteSettingsOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function readJson(body: ArrayBuffer): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function fetchSiteSettings(
  site: Pick<Site, 'url' | 'token'>,
  options: SiteSettingsOptions = {},
): Promise<FetchSiteSettingsResult> {
  const result = await fetchSite(site, '/v1/settings', { ...options, authToken: site.token });
  const interpreted = await interpretSiteResponse(result);
  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'unsupported', message: 'This website\'s CMS is too old for site settings. Upgrade it to 0.7.0 or later.' };
  }
  const body = interpreted.status === 200 ? readJson(interpreted.body) : null;
  if (!body || typeof body.settings !== 'object' || body.settings === null) {
    return { outcome: 'error', message: `Unexpected response from /v1/settings (${interpreted.status})` };
  }
  return {
    outcome: 'ok',
    payload: {
      schema: typeof body.schema === 'object' ? (body.schema as object | null) : null,
      settings: body.settings as Record<string, unknown>,
      resolved: (typeof body.resolved === 'object' && body.resolved !== null ? body.resolved : {}) as Record<string, unknown>,
      etag: interpreted.etag,
    },
  };
}

export type SaveSiteSettingsResult =
  | { outcome: 'ok'; etag: string }
  | { outcome: 'conflict'; message: string }
  | { outcome: 'invalid'; message: string; errors: Array<{ path: string; message: string }> }
  | { outcome: 'unreachable' | 'unauthorized' | 'error'; message: string };

export async function saveSiteSettings(
  site: Pick<Site, 'url' | 'token'>,
  settings: Record<string, unknown>,
  ifMatch: string,
  message: string,
  author: CommitAuthor,
  options: SiteSettingsOptions = {},
): Promise<SaveSiteSettingsResult> {
  const result = await fetchSite(site, '/v1/settings', {
    ...options,
    authToken: site.token,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': ifMatch },
    body: JSON.stringify({ settings, message, author }),
  });
  const interpreted = await interpretSiteResponse(result);
  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  const body = readJson(interpreted.body);
  const siteMessage = typeof body?.message === 'string' ? body.message : null;
  if (interpreted.status === 200) {
    return interpreted.etag
      ? { outcome: 'ok', etag: interpreted.etag }
      : { outcome: 'error', message: 'The site did not return a new ETag after saving' };
  }
  if (interpreted.status === 409) {
    return { outcome: 'conflict', message: siteMessage ?? 'The site settings changed since you opened them' };
  }
  if (interpreted.status === 400) {
    const errors = Array.isArray(body?.errors)
      ? (body.errors as unknown[]).filter(
          (entry): entry is { path: string; message: string } =>
            typeof entry === 'object' && entry !== null && typeof (entry as { path?: unknown }).path === 'string' && typeof (entry as { message?: unknown }).message === 'string',
        )
      : [];
    return { outcome: 'invalid', message: siteMessage ?? 'The site rejected these settings', errors };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/settings (${interpreted.status})` };
}
