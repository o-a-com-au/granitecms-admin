import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

// What links to a page (the agent's GET /v1/links?to=): the pages,
// drafts, menus and site settings that point at it, for the delete
// confirmation to list.

export interface SiteLinkReference {
  kind: 'page' | 'draft' | 'menu' | 'settings';
  path: string;
  label: string;
  url?: string;
  hrefs: string[];
}

export type FetchSiteLinksResult =
  | { outcome: 'ok'; references: SiteLinkReference[] }
  // A CMS older than link tracking (no /v1/links): the admin just
  // doesn't list links, rather than failing the delete.
  | { outcome: 'unsupported'; message: string }
  | { outcome: 'unreachable' | 'unauthorized' | 'error'; message: string };

export async function fetchSiteLinks(
  site: Pick<Site, 'url' | 'token'>,
  to: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<FetchSiteLinksResult> {
  const result = await fetchSite(site, `/v1/links?to=${encodeURIComponent(to)}`, { ...options, authToken: site.token });
  const interpreted = await interpretSiteResponse(result);
  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'unsupported', message: "This website's CMS is too old to list links." };
  }
  let body: unknown = null;
  try {
    body = JSON.parse(new TextDecoder().decode(interpreted.body)) as unknown;
  } catch {
    body = null;
  }
  const references = (body as { references?: unknown } | null)?.references;
  if (interpreted.status !== 200 || !Array.isArray(references)) {
    return { outcome: 'error', message: `Unexpected response from /v1/links (${interpreted.status})` };
  }
  return { outcome: 'ok', references: references as SiteLinkReference[] };
}
