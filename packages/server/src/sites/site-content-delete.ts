import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';
import type { CommitAuthor } from './commit-author.ts';

export type DeleteSiteContentResult =
  | { outcome: 'ok' }
  | { outcome: 'not-found'; message: string }
  // The agent deliberately rejects deleting a page with child pages
  // outright rather than cascading - "an accidental single DELETE
  // can't silently take a whole subtree with it" (delete-content.ts,
  // agent repo). Surfaced as its own outcome, not folded into 'invalid',
  // so the admin can show a message that's actually about children,
  // not a generic validation failure.
  | { outcome: 'has-children'; message: string }
  | { outcome: 'invalid'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface DeleteSiteContentOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// path is content-relative (e.g. "pages/about.json"), matching the
// agent's own DELETE /v1/content/*path - the same convention GET
// /v1/content/*path and PUT /v1/drafts/*path already use, unlike
// /v1/content/move (site-move.ts), which addresses pages by their
// public url instead.
export async function deleteSiteContent(
  site: Pick<Site, 'url' | 'token'>,
  path: string,
  message: string,
  author: CommitAuthor,
  options: DeleteSiteContentOptions = {},
): Promise<DeleteSiteContentResult> {
  const result = await fetchSite(site, `/v1/content/${path}`, {
    ...options,
    authToken: site.token,
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, author }),
  });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 204) {
    return { outcome: 'ok' };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found', message: readErrorMessage(interpreted.body, 'No page found at that path') };
  }
  if (interpreted.status === 409) {
    return {
      outcome: 'has-children',
      message: readErrorMessage(interpreted.body, 'This page has child pages - delete them first'),
    };
  }
  if (interpreted.status === 400) {
    return { outcome: 'invalid', message: readErrorMessage(interpreted.body, 'That delete request is not valid') };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/content/${path} (${interpreted.status})` };
}

function readErrorMessage(body: ArrayBuffer, fallback: string): string {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    return typeof parsed.message === 'string' ? parsed.message : fallback;
  } catch {
    return fallback;
  }
}
