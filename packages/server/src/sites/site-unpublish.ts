import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';
import type { CommitAuthor } from './commit-author.ts';

export type UnpublishSiteResult =
  | { outcome: 'ok' }
  | { outcome: 'invalid'; message: string }
  | { outcome: 'not-found'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface UnpublishSiteOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// G4: sets published:false on the live file in place and commits -
// the path lives in the URL here, not a paths array, since unpublish
// is a single-page operation on the agent side too (unlike publish).
export async function unpublishSite(
  site: Pick<Site, 'url' | 'token'>,
  path: string,
  message: string,
  author: CommitAuthor,
  options: UnpublishSiteOptions = {},
): Promise<UnpublishSiteResult> {
  const result = await fetchSite(site, `/v1/unpublish/${path}`, {
    ...options,
    authToken: site.token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, author }),
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
  if (interpreted.status === 400) {
    return { outcome: 'invalid', message: 'The site rejected this unpublish' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found', message: 'No live page at this path' };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/unpublish/${path} (${interpreted.status})` };
}
