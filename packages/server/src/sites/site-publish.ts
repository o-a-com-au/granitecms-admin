import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';
import type { CommitAuthor } from './commit-author.ts';

export type PublishSiteResult =
  | { outcome: 'ok' }
  | { outcome: 'invalid'; message: string }
  | { outcome: 'not-found'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface PublishSiteOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// G1: a single call to the agent's real (batch) publish route - this
// admin only ever calls it with one path at a time (no multi-select UI
// yet), but the request shape stays a faithful mirror of the real API
// rather than inventing a single-page-only endpoint of its own.
export async function publishSite(
  site: Pick<Site, 'url' | 'token'>,
  paths: string[],
  message: string,
  author: CommitAuthor,
  options: PublishSiteOptions = {},
): Promise<PublishSiteResult> {
  const result = await fetchSite(site, '/v1/publish', {
    ...options,
    authToken: site.token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths, message, author }),
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
    return { outcome: 'invalid', message: 'The site rejected this publish' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found', message: 'This draft no longer exists' };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/publish (${interpreted.status})` };
}
