import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';
import type { CommitAuthor } from './commit-author.ts';

export type RevertSiteResult =
  | { outcome: 'ok' }
  | { outcome: 'invalid-ref'; message: string }
  | { outcome: 'not-found-at-ref'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface RevertSiteOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// H4: always creates a NEW commit on the agent side (git checkout
// <ref> -- <path> then a normal commit) - history is never rewritten.
// Single-path array, same "batch shape reconstructed at the call
// site" precedent as site-publish.ts.
export async function revertSitePath(
  site: Pick<Site, 'url' | 'token'>,
  ref: string,
  path: string,
  message: string,
  author: CommitAuthor,
  options: RevertSiteOptions = {},
): Promise<RevertSiteResult> {
  const result = await fetchSite(site, '/v1/git/revert', {
    ...options,
    authToken: site.token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, paths: [`content/${path}`], message, author }),
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
    return { outcome: 'invalid-ref', message: 'That is not a valid revision' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found-at-ref', message: 'No content at this path at that revision' };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/git/revert (${interpreted.status})` };
}
