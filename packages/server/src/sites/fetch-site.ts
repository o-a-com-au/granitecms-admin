import type { Site } from './site.ts';

const DEFAULT_TIMEOUT_MS = 4000;

export interface FetchSiteOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  authToken?: string;
  method?: string;
  headers?: Record<string, string>;
  // FormData for a media upload (site-media.ts) - Node's built-in fetch
  // (undici) computes the correct multipart/form-data; boundary=...
  // header itself for a FormData body, so a caller passing one must
  // never also set a Content-Type header, or the two would conflict.
  body?: string | FormData;
}

export type FetchSiteResult = { outcome: 'response'; response: Response } | { outcome: 'unreachable' };

// The one place a request URL for a registered site is built (always
// new URL(path, site.url), never string concatenation) - keeps A4's
// hardcoded-URL static-analysis guard passing with zero allowlist
// entries, since every caller goes through here instead of building
// its own URL by hand. Only the mechanical part is shared; each
// caller (site-status.ts, site-content.ts, site-editor-content.ts,
// site-draft-save.ts) keeps its own interpretation of the response -
// those are different domain concepts that don't belong in one shared
// result type.
export async function fetchSite(
  site: Pick<Site, 'url'>,
  path: string,
  options: FetchSiteOptions = {},
): Promise<FetchSiteResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = {
    ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : undefined),
    ...options.headers,
  };

  try {
    const response = await fetchImpl(new URL(path, site.url), {
      method: options.method,
      headers,
      body: options.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { outcome: 'response', response };
  } catch {
    return { outcome: 'unreachable' };
  }
}
