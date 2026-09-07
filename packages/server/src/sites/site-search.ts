import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export type ReindexSiteResult =
  | { outcome: 'ok' }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface ReindexSiteOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// POST /v1/search/rebuild (app-granite-cms's own docs/phase-3-checklist.md
// Group R) - unlike publish/unpublish, this creates no git commit on the
// agent side, so there's no author/message to carry and no 400/404 to
// interpret: a valid, reachable token always gets a plain 200.
export async function reindexSite(site: Pick<Site, 'url' | 'token'>, options: ReindexSiteOptions = {}): Promise<ReindexSiteResult> {
  const result = await fetchSite(site, '/v1/search/rebuild', {
    ...options,
    authToken: site.token,
    method: 'POST',
  });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 200) {
    return { outcome: 'ok' };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/search/rebuild (${interpreted.status})` };
}
