import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export type SaveSiteDraftResult =
  | { outcome: 'ok'; etag: string }
  | { outcome: 'conflict'; message: string }
  | { outcome: 'invalid'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface SaveSiteDraftOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// Presence of If-Match is checked at the route layer, before this is
// ever called (mirroring requireAuth's own fail-fast precedent) - a
// real 428 from the site should never happen given that, so it isn't
// specially interpreted here, only the outcomes that genuinely can
// happen once If-Match is known to be present.
export async function saveSiteDraft(
  site: Pick<Site, 'url' | 'token'>,
  path: string,
  content: string,
  ifMatch: string,
  options: SaveSiteDraftOptions = {},
): Promise<SaveSiteDraftResult> {
  const result = await fetchSite(site, `/v1/drafts/${path}`, {
    ...options,
    authToken: site.token,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': ifMatch },
    body: content,
  });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 200) {
    if (!interpreted.etag) {
      return { outcome: 'error', message: 'The site did not return a new ETag after saving' };
    }
    return { outcome: 'ok', etag: interpreted.etag };
  }
  if (interpreted.status === 409) {
    return { outcome: 'conflict', message: 'This page changed since you opened it' };
  }
  if (interpreted.status === 400) {
    return { outcome: 'invalid', message: 'The site rejected this content as invalid' };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/drafts/${path} (${interpreted.status})` };
}
