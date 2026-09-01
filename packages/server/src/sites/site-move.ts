import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';
import type { CommitAuthor } from './commit-author.ts';

export type MoveSiteResult =
  | { outcome: 'ok' }
  | { outcome: 'source-not-found'; message: string }
  | { outcome: 'destination-exists'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface MoveSiteOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  // false (the default) matches the Slug field's own rename-on-save
  // (PageMetadataPanel.tsx) - a WordPress-style rename with no
  // automatic redirect (the project owner's own call - see the
  // redirect-creation discussion in phase-3-checklist.md's Group
  // notes). The page tree's drag-to-reparent feature passes true: it
  // changes a page's whole URL prefix, not just its final slug, so a
  // link elsewhere is more likely to break without one.
  createRedirect?: boolean;
}

// Backs both the Slug field's rename-on-save and the page tree's
// drag-to-reparent feature - from and to are page URLs ("/about"), not
// content-relative paths, since that's what the agent's own POST
// /v1/content/move expects (unlike history/revert, which resolve
// relative to siteRoot and need a "content/" prefix - move.ts's own
// urlToPagePath does that translation agent-side instead).
export async function moveSitePath(
  site: Pick<Site, 'url' | 'token'>,
  from: string,
  to: string,
  message: string,
  author: CommitAuthor,
  options: MoveSiteOptions = {},
): Promise<MoveSiteResult> {
  const { createRedirect = false, ...fetchOptions } = options;
  const result = await fetchSite(site, '/v1/content/move', {
    ...fetchOptions,
    authToken: site.token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, message, author, createRedirect }),
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
  if (interpreted.status === 404) {
    return { outcome: 'source-not-found', message: 'No page found at that path' };
  }
  if (interpreted.status === 409) {
    return { outcome: 'destination-exists', message: 'A page already exists at that path' };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/content/move (${interpreted.status})` };
}
