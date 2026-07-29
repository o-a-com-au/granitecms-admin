import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export type SitePreviewResult =
  | { outcome: 'ok'; status: number; contentType: string; body: ArrayBuffer }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string };

export interface FetchSitePreviewOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// The rendered page's root-relative asset references (e.g.
// href="/assets/style.css") are meant to resolve against the SITE's
// own origin - but the browser resolves them against wherever the
// document was actually loaded from, which is this admin's own
// preview proxy URL once embedded in the iframe. Without correction,
// every stylesheet/script 404s (or worse, silently hits the admin's
// own unrelated /assets/* route) instead of the real one. A <base>
// tag is the standard fix for exactly this "proxied HTML, different
// origin" situation - it only affects how the browser resolves
// resource URLs, not the page's actual rendered content, so it's a
// narrow exception to this route's otherwise byte-for-byte forwarding,
// not a re-render or approximation of the draft state itself (F3 is
// still about content, not asset plumbing). A no-op if the HTML has
// no <head> tag to attach to.
function injectBaseTag(html: string, siteUrl: string): string {
  const baseHref = `${siteUrl}/`.replace(/"/g, '&quot;');
  return html.replace(/<head[^>]*>/i, (match) => `${match}<base href="${baseHref}">`);
}

// F1, F3: a single call - unlike site-editor-content.ts's draft-then-
// live fallback, GET /v1/preview/* already does that overlay itself
// on the agent side, so the admin only ever needs to ask once and
// forward whatever comes back, byte-for-byte, including its real
// Content-Type (text/html on success, application/json on the site's
// own 404) - that's what makes this a real preview, not an
// approximation. Content-type is read directly off the raw response
// here rather than added to interpretSiteResponse's shared shape:
// its two existing callers (site-editor-content.ts, site-draft-save.ts)
// both fix their own content-type and never needed the site's real
// one, so widening a helper three routes depend on for one new caller
// was worse than this one-line, single-purpose read (headers access
// doesn't consume the body stream, so it's safe alongside
// interpretSiteResponse's own arrayBuffer() read of the same result).
export async function fetchSitePreview(
  site: Pick<Site, 'url' | 'token'>,
  urlPath: string,
  options: FetchSitePreviewOptions = {},
): Promise<SitePreviewResult> {
  const result = await fetchSite(site, `/v1/preview${urlPath}`, { ...options, authToken: site.token });
  const contentType = result.outcome === 'response' ? result.response.headers.get('content-type') : null;
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
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
