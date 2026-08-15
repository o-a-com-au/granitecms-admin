import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export interface HistoryCommit {
  hash: string;
  author: { name: string; email: string };
  date: string;
  message: string;
  isCheckpoint: boolean;
}

export type SiteHistoryResult =
  | { outcome: 'ok'; commits: HistoryCommit[]; hasMore: boolean }
  | { outcome: 'not-found'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface FetchSiteHistoryOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isHistoryCommit(value: unknown): value is HistoryCommit {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const author = record.author as Record<string, unknown> | undefined;
  return (
    typeof record.hash === 'string' &&
    typeof author === 'object' &&
    author !== null &&
    typeof author.name === 'string' &&
    typeof author.email === 'string' &&
    typeof record.date === 'string' &&
    typeof record.message === 'string' &&
    typeof record.isCheckpoint === 'boolean'
  );
}

function isHistoryLogBody(value: unknown): value is { commits: HistoryCommit[]; hasMore: boolean } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.commits) &&
    record.commits.every(isHistoryCommit) &&
    typeof record.hasMore === 'boolean'
  );
}

// H1: paths on GET /v1/git/log are resolved relative to the site's
// siteRoot, not contentRoot like every other route this admin calls
// (confirmed by reading the agent's own git-history.ts and its
// tests) - the leading "content/" here is not a stylistic choice,
// it's the only way a bare "pages/about.json" resolves to the right
// file at all.
export async function fetchSiteHistory(
  site: Pick<Site, 'url' | 'token'>,
  path: string,
  limit: number,
  options: FetchSiteHistoryOptions = {},
): Promise<SiteHistoryResult> {
  const query = new URLSearchParams({ path: `content/${path}`, limit: String(limit) });
  const result = await fetchSite(site, `/v1/git/log?${query.toString()}`, { ...options, authToken: site.token });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found', message: 'No content at this path' };
  }
  if (interpreted.status !== 200) {
    return { outcome: 'error', message: `Unexpected response from /v1/git/log (${interpreted.status})` };
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(interpreted.body));
  } catch {
    return { outcome: 'error', message: '/v1/git/log did not return valid JSON' };
  }

  if (!isHistoryLogBody(body)) {
    return { outcome: 'error', message: '/v1/git/log did not return a commit log' };
  }

  return { outcome: 'ok', commits: body.commits, hasMore: body.hasMore };
}

// Site-wide history (the top-nav "History" tab, not a single page's
// own History link) - scoped to "content" (not the bare/omitted path,
// which would return the whole repo including theme/vhost config
// commits), a deliberate choice confirmed with the project owner
// rather than the noisier whole-repo default. No not-found branch -
// unlike a single page's path, content/ always exists.
export async function fetchSiteContentHistory(
  site: Pick<Site, 'url' | 'token'>,
  limit: number,
  options: FetchSiteHistoryOptions = {},
): Promise<SiteHistoryResult> {
  const query = new URLSearchParams({ path: 'content', limit: String(limit) });
  const result = await fetchSite(site, `/v1/git/log?${query.toString()}`, { ...options, authToken: site.token });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status !== 200) {
    return { outcome: 'error', message: `Unexpected response from /v1/git/log (${interpreted.status})` };
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(interpreted.body));
  } catch {
    return { outcome: 'error', message: '/v1/git/log did not return valid JSON' };
  }

  if (!isHistoryLogBody(body)) {
    return { outcome: 'error', message: '/v1/git/log did not return a commit log' };
  }

  return { outcome: 'ok', commits: body.commits, hasMore: body.hasMore };
}
