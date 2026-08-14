import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export interface MediaEntry {
  name: string;
  size: number;
  mtimeMs: number;
  url: string;
}

// Server enforces the real cap regardless (the agent's own
// limits.fileSize) - this is only a client-side hint used when the
// capabilities call below fails/is malformed, so the library can still
// load rather than being blocked by a capabilities hiccup. Same
// number as the admin's own defensive multipart ceiling in
// routes/sites.ts - not load-bearing that they match, just a
// convenient shared constant.
const FALLBACK_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface ListSiteMediaOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type ListSiteMediaResult =
  | { outcome: 'ok'; items: MediaEntry[]; maxUploadBytes: number }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

function isMediaEntry(value: unknown): value is MediaEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === 'string' &&
    typeof record.size === 'number' &&
    typeof record.mtimeMs === 'number' &&
    typeof record.url === 'string'
  );
}

// The upload response has no mtimeMs (the agent's own POST /v1/media
// doesn't report it - only list does) - a distinct, narrower guard
// rather than reusing isMediaEntry with a fabricated value.
function isUploadResult(value: unknown): value is { name: string; size: number; url: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.name === 'string' && typeof record.size === 'number' && typeof record.url === 'string';
}

// Rewrites a media entry's site-relative url ("/media/<name>") to an
// absolute one against the site's own origin - the browser then loads
// images directly from the site's own public, deliberately
// unauthenticated GET /media/*, never proxied through this backend.
// Same new URL(path, base) construction fetchSite.ts already uses, so
// this stays A4-compliant (no hardcoded URL literal) with no
// allowlist entry needed.
function toAbsoluteUrl(site: Pick<Site, 'url'>, relativeUrl: string): string {
  return new URL(relativeUrl, site.url).toString();
}

// Deliberately two sequential calls, not one - not unprecedented,
// site-status.ts already does two calls to one site for its own
// reasons. /v1/capabilities is unauthenticated (can never prove a
// stored token is valid, per site-status.ts's own comment) but is the
// only place maxUploadBytes is reported, so it's fetched here purely
// for that value, tolerating failure. /v1/media is the real,
// token-scoped list.
export async function listSiteMedia(
  site: Pick<Site, 'url' | 'token'>,
  options: ListSiteMediaOptions = {},
): Promise<ListSiteMediaResult> {
  const fetchOptions = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };

  let maxUploadBytes = FALLBACK_MAX_UPLOAD_BYTES;
  const capabilitiesResult = await fetchSite(site, '/v1/capabilities', fetchOptions);
  if (capabilitiesResult.outcome === 'response' && capabilitiesResult.response.ok) {
    try {
      const body = (await capabilitiesResult.response.json()) as Record<string, unknown>;
      if (typeof body.maxMediaUploadBytes === 'number') {
        maxUploadBytes = body.maxMediaUploadBytes;
      }
    } catch {
      // Malformed capabilities body - keep the fallback, don't fail
      // the whole list over it.
    }
  }

  const result = await fetchSite(site, '/v1/media', { ...fetchOptions, authToken: site.token });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 200) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(interpreted.body));
    } catch {
      return { outcome: 'error', message: '/v1/media did not return valid JSON' };
    }
    if (!Array.isArray(parsed) || !parsed.every(isMediaEntry)) {
      return { outcome: 'error', message: '/v1/media did not return the expected shape' };
    }
    const items = parsed.map((entry) => ({ ...entry, url: toAbsoluteUrl(site, entry.url) }));
    return { outcome: 'ok', items, maxUploadBytes };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/media (${interpreted.status})` };
}

export type UploadSiteMediaResult =
  | { outcome: 'ok'; name: string; size: number; url: string }
  | { outcome: 'unsupported-type'; message: string }
  | { outcome: 'too-large'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export async function uploadSiteMedia(
  site: Pick<Site, 'url' | 'token'>,
  filename: string,
  bytes: Buffer,
  options: ListSiteMediaOptions = {},
): Promise<UploadSiteMediaResult> {
  const form = new FormData();
  form.append('file', new Blob([bytes]), filename);

  // No Content-Type header here - see fetch-site.ts's own comment on
  // why: undici computes the multipart boundary itself from the
  // FormData body, and a manually-set header would conflict with it.
  const result = await fetchSite(site, '/v1/media', {
    ...options,
    authToken: site.token,
    method: 'POST',
    body: form,
  });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 201) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(interpreted.body));
    } catch {
      return { outcome: 'error', message: '/v1/media did not return valid JSON' };
    }
    if (!isUploadResult(parsed)) {
      return { outcome: 'error', message: '/v1/media did not return the expected shape' };
    }
    return { outcome: 'ok', name: parsed.name, size: parsed.size, url: toAbsoluteUrl(site, parsed.url) };
  }
  if (interpreted.status === 415) {
    return { outcome: 'unsupported-type', message: 'That file type is not accepted' };
  }
  if (interpreted.status === 413) {
    return { outcome: 'too-large', message: 'That file is too large' };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/media (${interpreted.status})` };
}

export type DeleteSiteMediaResult =
  | { outcome: 'ok' }
  | { outcome: 'not-found'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export async function deleteSiteMedia(
  site: Pick<Site, 'url' | 'token'>,
  name: string,
  options: ListSiteMediaOptions = {},
): Promise<DeleteSiteMediaResult> {
  const result = await fetchSite(site, `/v1/media/${encodeURIComponent(name)}`, {
    ...options,
    authToken: site.token,
    method: 'DELETE',
  });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 204) {
    return { outcome: 'ok' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found', message: `No media file at "${name}"` };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/media/${name} (${interpreted.status})` };
}
