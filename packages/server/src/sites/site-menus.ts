import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';
import type { CommitAuthor } from './commit-author.ts';

export type SaveSiteMenuResult =
  | { outcome: 'ok'; etag: string }
  | { outcome: 'conflict'; message: string }
  | { outcome: 'invalid'; message: string }
  | { outcome: 'not-found'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface SaveSiteMenuOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// path arrives relative to the full content root (e.g. "menus/main.json" -
// the same convention every other client path already uses, matching
// readSiteEditorContent), but the agent's own PUT /v1/menus/* is rooted
// at menusRoot specifically (see manage-menus.ts's saveMenuJob), unlike
// GET/DELETE/move for the same file, which stay on the generic
// /v1/content routes rooted at contentRoot. Stripped here, the one
// place that translation needs to happen.
function stripMenusPrefix(path: string): string {
  return path.replace(/^menus\//, '');
}

// Unlike site-redirects.ts's own writes, this one is If-Match/etag
// protected (menu.schema.json content is a whole file, not a
// from-keyed entry) - closer in shape to site-draft-save.ts's own
// contract than to redirects, since the agent's PUT /v1/menus/*
// commits immediately but still needs optimistic concurrency the same
// way a draft save does.
export async function saveSiteMenu(
  site: Pick<Site, 'url' | 'token'>,
  path: string,
  content: unknown,
  ifMatch: string,
  message: string,
  author: CommitAuthor,
  options: SaveSiteMenuOptions = {},
): Promise<SaveSiteMenuResult> {
  const relativePath = stripMenusPrefix(path);
  const result = await fetchSite(site, `/v1/menus/${relativePath}`, {
    ...options,
    authToken: site.token,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': ifMatch },
    body: JSON.stringify({ content, message, author }),
  });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 200) {
    if (!interpreted.etag) {
      return { outcome: 'error', message: 'The site did not return a new ETag after saving' };
    }
    return { outcome: 'ok', etag: interpreted.etag };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found', message: readErrorMessage(interpreted.body, 'No menu found at that path') };
  }
  if (interpreted.status === 409) {
    return { outcome: 'conflict', message: readErrorMessage(interpreted.body, 'This menu changed since you opened it') };
  }
  if (interpreted.status === 400) {
    return { outcome: 'invalid', message: readErrorMessage(interpreted.body, 'The site rejected this menu as invalid') };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/menus/${relativePath} (${interpreted.status})` };
}

function readErrorMessage(body: ArrayBuffer, fallback: string): string {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    return typeof parsed.message === 'string' ? parsed.message : fallback;
  } catch {
    return fallback;
  }
}
