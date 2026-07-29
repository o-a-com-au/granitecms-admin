import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export type SiteRevisionResult =
  | { outcome: 'ok'; body: ArrayBuffer }
  | { outcome: 'invalid-ref'; message: string }
  | { outcome: 'not-found-at-ref'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface FetchSiteRevisionOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// H3: ref is passed through completely unmodified - the literal
// string "HEAD" is a valid, tested ref on the agent side, and is the
// entire mechanism for "diff against current" (no separate live-
// content endpoint exists or is needed). invalid-ref (400) and
// not-found-at-ref (404) are kept as genuinely distinct outcomes,
// matching the agent's own deliberate non-collapse of these two
// failure reasons.
export async function fetchSiteRevision(
  site: Pick<Site, 'url' | 'token'>,
  ref: string,
  path: string,
  options: FetchSiteRevisionOptions = {},
): Promise<SiteRevisionResult> {
  const result = await fetchSite(site, `/v1/git/show/${ref}/content/${path}`, {
    ...options,
    authToken: site.token,
  });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 200) {
    return { outcome: 'ok', body: interpreted.body };
  }
  if (interpreted.status === 400) {
    return { outcome: 'invalid-ref', message: 'That is not a valid revision' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found-at-ref', message: 'No content at this path at that revision' };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/git/show (${interpreted.status})` };
}
