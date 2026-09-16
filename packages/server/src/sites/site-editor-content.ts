import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse, type InterpretedSiteResponse } from './interpret-site-response.ts';

export type SiteEditorContentResult =
  | { outcome: 'ok'; source: 'draft' | 'live'; etag: string; body: ArrayBuffer }
  | { outcome: 'not-found' }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface FetchSiteEditorContentOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function fetchInterpreted(
  site: Pick<Site, 'url' | 'token'>,
  urlPath: string,
  options: FetchSiteEditorContentOptions,
): Promise<InterpretedSiteResponse> {
  const result = await fetchSite(site, urlPath, { ...options, authToken: site.token });
  return interpretSiteResponse(result);
}

// Whether a live (published) file exists at this path at all,
// independent of any draft over it. fetchSiteEditorContent above
// deliberately never calls live when a draft succeeds, so it cannot
// answer this - and the difference matters: discarding the draft of a
// page that has never been published deletes the page outright, while
// discarding one over a live page merely reverts it. The admin needs
// to be able to say which of those a Discard is about to do.
//
// A plain read of the agent's own /v1/content, which reads contentRoot
// only (its handleReadContent never consults drafts), so a 404 here
// means "never published" rather than "no draft".
export async function fetchSiteLiveContentExists(
  site: Pick<Site, 'url' | 'token'>,
  path: string,
  options: FetchSiteEditorContentOptions = {},
): Promise<{ outcome: 'ok'; exists: boolean } | { outcome: 'unreachable' | 'unauthorized' | 'error'; message: string }> {
  const live = await fetchInterpreted(site, `/v1/content/${path}`, options);

  if (live.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (live.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (live.status === 404) {
    return { outcome: 'ok', exists: false };
  }
  if (live.status !== 200) {
    return { outcome: 'error', message: `Unexpected response from /v1/content/${path} (${live.status})` };
  }
  return { outcome: 'ok', exists: true };
}

// E1: draft-if-one-exists-else-live, via two sequential calls - no
// unified endpoint exists on the agent side. Only falls back to live
// on a literal 404 from the draft call (not on any other failure -
// don't double the failure surface), and never calls live at all if
// draft succeeds.
export async function fetchSiteEditorContent(
  site: Pick<Site, 'url' | 'token'>,
  path: string,
  options: FetchSiteEditorContentOptions = {},
): Promise<SiteEditorContentResult> {
  const draft = await fetchInterpreted(site, `/v1/drafts/${path}`, options);

  if (draft.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (draft.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (draft.status === 200) {
    if (!draft.etag) {
      return { outcome: 'error', message: 'The site did not return an ETag for the draft' };
    }
    return { outcome: 'ok', source: 'draft', etag: draft.etag, body: draft.body };
  }
  if (draft.status !== 404) {
    return { outcome: 'error', message: `Unexpected response from /v1/drafts/${path} (${draft.status})` };
  }

  const live = await fetchInterpreted(site, `/v1/content/${path}`, options);

  if (live.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (live.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (live.status === 404) {
    return { outcome: 'not-found' };
  }
  if (live.status !== 200) {
    return { outcome: 'error', message: `Unexpected response from /v1/content/${path} (${live.status})` };
  }
  if (!live.etag) {
    return { outcome: 'error', message: 'The site did not return an ETag for the live content' };
  }
  return { outcome: 'ok', source: 'live', etag: live.etag, body: live.body };
}
