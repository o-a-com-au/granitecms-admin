import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

// Pages that were deleted and aren't back (the agent's GET
// /v1/deleted-pages), each with the ref to restore it from.
export interface DeletedPage {
  path: string;
  url: string;
  title: string;
  deletedAt: string;
  deletedBy: string;
  ref: string;
}

export type FetchDeletedPagesResult =
  | { outcome: 'ok'; pages: DeletedPage[] }
  // A CMS older than this: the admin just doesn't list deleted pages.
  | { outcome: 'unsupported'; message: string }
  | { outcome: 'unreachable' | 'unauthorized' | 'error'; message: string };

export async function fetchSiteDeletedPages(
  site: Pick<Site, 'url' | 'token'>,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<FetchDeletedPagesResult> {
  const result = await fetchSite(site, '/v1/deleted-pages', { ...options, authToken: site.token });
  const interpreted = await interpretSiteResponse(result);
  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'unsupported', message: "This website's CMS is too old to list deleted pages." };
  }
  let body: unknown = null;
  try {
    body = JSON.parse(new TextDecoder().decode(interpreted.body)) as unknown;
  } catch {
    body = null;
  }
  const pages = (body as { pages?: unknown } | null)?.pages;
  if (interpreted.status !== 200 || !Array.isArray(pages)) {
    return { outcome: 'error', message: `Unexpected response from /v1/deleted-pages (${interpreted.status})` };
  }
  return { outcome: 'ok', pages: pages as DeletedPage[] };
}
