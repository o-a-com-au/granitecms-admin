import type { Site } from './site.ts';

const DEFAULT_TIMEOUT_MS = 4000;

export interface FetchSiteOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  authToken?: string;
}

export type FetchSiteResult = { outcome: 'response'; response: Response } | { outcome: 'unreachable' };

// The one place a request URL for a registered site is built (always
// new URL(path, site.url), never string concatenation) - keeps A4's
// hardcoded-URL static-analysis guard passing with zero allowlist
// entries, since every caller goes through here instead of building
// its own URL by hand. Only the mechanical part is shared; each
// caller (site-status.ts, site-content.ts) keeps its own
// interpretation of the response - those are different domain
// concepts (a 4-way health status vs a 3-way content-fetch failure
// reason) that don't belong in one shared result type.
export async function fetchSite(
  site: Pick<Site, 'url'>,
  path: string,
  options: FetchSiteOptions = {},
): Promise<FetchSiteResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = options.authToken ? { Authorization: `Bearer ${options.authToken}` } : undefined;

  try {
    const response = await fetchImpl(new URL(path, site.url), {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { outcome: 'response', response };
  } catch {
    return { outcome: 'unreachable' };
  }
}
