import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export type DiscardSiteDraftResult =
  | { outcome: 'ok' }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface DiscardSiteDraftOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// G3: the agent's own DELETE /v1/drafts/:path is already idempotent
// (204 whether or not a draft existed) and never commits - nothing
// for this module to interpret beyond unreachable/unauthorized.
export async function discardSiteDraft(
  site: Pick<Site, 'url' | 'token'>,
  path: string,
  options: DiscardSiteDraftOptions = {},
): Promise<DiscardSiteDraftResult> {
  const result = await fetchSite(site, `/v1/drafts/${path}`, { ...options, authToken: site.token, method: 'DELETE' });
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
  return { outcome: 'error', message: `Unexpected response from /v1/drafts/${path} (${interpreted.status})` };
}
