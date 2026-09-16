import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';
import type { CommitAuthor } from './commit-author.ts';

export type PublishSitePageResult =
  | { outcome: 'ok' }
  | { outcome: 'invalid'; message: string }
  | { outcome: 'not-found'; message: string }
  | { outcome: 'unsupported'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface PublishSitePageOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// Pulls { message } out of a site's error body, or null if it is not
// JSON with one. Used only to tell two different 404s apart, below.
function messageFrom(body: ArrayBuffer): string | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as { message?: unknown };
    return typeof parsed.message === 'string' ? parsed.message : null;
  } catch {
    return null;
  }
}

// The twin of site-unpublish.ts: sets published:true on the live file
// in place and commits. The path lives in the URL, not a paths array,
// because this is a single-page operation on the agent side too.
//
// Deliberately NOT site-publish.ts (POST /v1/publish), which promotes
// drafts: a page that is live but unpublished has no draft to promote,
// so that route cannot reach it at all, and promoting a draft would
// push every pending edit live alongside the status change. This only
// ever flips the one flag, and leaves any draft untouched.
export async function publishSitePage(
  site: Pick<Site, 'url' | 'token'>,
  path: string,
  message: string,
  author: CommitAuthor,
  options: PublishSitePageOptions = {},
): Promise<PublishSitePageResult> {
  const result = await fetchSite(site, `/v1/publish-page/${path}`, {
    ...options,
    authToken: site.token,
    method: 'POST',
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
  if (interpreted.status === 200) {
    return { outcome: 'ok' };
  }
  if (interpreted.status === 400) {
    return { outcome: 'invalid', message: 'The site rejected this publish' };
  }
  if (interpreted.status === 404) {
    // Two completely different problems arrive as a 404 here: the page
    // is not live, or this site is running an agent old enough not to
    // have this route at all (Fastify answers an unknown route with a
    // 404 of its own). Reporting the second as the first is actively
    // misleading - it blames the content when the real fix is updating
    // the site - and it did exactly that in practice, against a site
    // still on the released 0.2.2.
    //
    // Fastify's own not-found body names the route ("Route
    // POST:/v1/publish-page/... not found"); the agent's own
    // page-not-found names the page instead ("No live page found at
    // ..."), so the two are distinguishable without guessing.
    const message = messageFrom(interpreted.body);
    if (message !== null && message.startsWith('Route ') && message.includes(' not found')) {
      return {
        outcome: 'unsupported',
        message:
          'This website is running a version of the CMS agent with no publish-in-place support. Update the site to a newer version and restart it.',
      };
    }
    return { outcome: 'not-found', message: 'No live page at this path' };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/publish-page/${path} (${interpreted.status})` };
}
