import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export type SitePreviewRevisionResult =
  | { outcome: 'ok'; status: number; contentType: string; body: ArrayBuffer }
  | { outcome: 'invalid-ref'; message: string }
  | { outcome: 'not-found-at-ref'; message: string }
  | { outcome: 'unrenderable'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface FetchSitePreviewRevisionOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// Same <head>-tag rewrite as site-preview.ts, for the same reason: the
// rendered page's root-relative asset references need to resolve
// against the site's own origin, not this admin's proxy URL.
function injectBaseTag(html: string, siteUrl: string): string {
  const baseHref = `${siteUrl}/`.replace(/"/g, '&quot;');
  return html.replace(/<head[^>]*>/i, (match) => `${match}<base href="${baseHref}">`);
}

// urlPath takes the site's own public URL path, matching
// fetchSitePreview's contract exactly (not a content-store path like
// fetchSiteRevision/fetchSiteHistory use) - GET /v1/preview-revision/*
// is a sibling of GET /v1/preview/* on the agent side and shares its
// URL-path convention, so this proxy reuses the same shape rather than
// site-revision.ts's path-based one.
export async function fetchSitePreviewRevision(
  site: Pick<Site, 'url' | 'token'>,
  urlPath: string,
  ref: string,
  options: FetchSitePreviewRevisionOptions = {},
): Promise<SitePreviewRevisionResult> {
  const result = await fetchSite(site, `/v1/preview-revision/${ref}${urlPath}`, {
    ...options,
    authToken: site.token,
  });
  const contentType = result.outcome === 'response' ? result.response.headers.get('content-type') : null;
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 400) {
    return { outcome: 'invalid-ref', message: 'That is not a valid revision' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found-at-ref', message: 'No page at this path at that revision' };
  }
  // The agent returns 422 when the revision's own content references a
  // section/block type or layout that no longer exists in the site's
  // current theme (themes are never revision-pinned) - a real,
  // expected outcome for old-enough revisions, not a 5xx-class failure.
  if (interpreted.status === 422) {
    return { outcome: 'unrenderable', message: 'This revision cannot be previewed with the current theme' };
  }
  if (interpreted.status !== 200) {
    return { outcome: 'error', message: `Unexpected response from /v1/preview-revision (${interpreted.status})` };
  }

  const resolvedContentType = contentType ?? 'application/octet-stream';
  if (resolvedContentType.startsWith('text/html')) {
    const html = new TextDecoder().decode(interpreted.body);
    const withBase = injectBaseTag(html, site.url);
    return {
      outcome: 'ok',
      status: interpreted.status,
      contentType: resolvedContentType,
      body: new TextEncoder().encode(withBase).buffer,
    };
  }

  return {
    outcome: 'ok',
    status: interpreted.status,
    contentType: resolvedContentType,
    body: interpreted.body,
  };
}
