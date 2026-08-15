import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';
import type { CommitAuthor } from './commit-author.ts';

export interface RedirectEntry {
  from: string;
  to: string;
  note?: string;
}

export interface SiteRedirectsOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isRedirectEntry(value: unknown): value is RedirectEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.from === 'string' &&
    typeof record.to === 'string' &&
    (record.note === undefined || typeof record.note === 'string')
  );
}

export type ListSiteRedirectsResult =
  | { outcome: 'ok'; entries: RedirectEntry[] }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export async function listSiteRedirects(
  site: Pick<Site, 'url' | 'token'>,
  options: SiteRedirectsOptions = {},
): Promise<ListSiteRedirectsResult> {
  const result = await fetchSite(site, '/v1/redirects', { ...options, authToken: site.token });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status !== 200) {
    return { outcome: 'error', message: `Unexpected response from /v1/redirects (${interpreted.status})` };
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(interpreted.body));
  } catch {
    return { outcome: 'error', message: '/v1/redirects did not return valid JSON' };
  }
  const entries = (body as Record<string, unknown> | null)?.entries;
  if (!Array.isArray(entries) || !entries.every(isRedirectEntry)) {
    return { outcome: 'error', message: '/v1/redirects did not return the expected shape' };
  }
  return { outcome: 'ok', entries };
}

export type UpsertSiteRedirectResult =
  | { outcome: 'ok'; entry: RedirectEntry; retargeted: RedirectEntry[] }
  | { outcome: 'invalid'; message: string }
  | { outcome: 'not-found'; message: string }
  | { outcome: 'conflict'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

async function upsertSiteRedirect(
  method: 'POST' | 'PUT',
  site: Pick<Site, 'url' | 'token'>,
  from: string,
  to: string,
  note: string | undefined,
  message: string,
  author: CommitAuthor,
  options: SiteRedirectsOptions,
): Promise<UpsertSiteRedirectResult> {
  const result = await fetchSite(site, '/v1/redirects', {
    ...options,
    authToken: site.token,
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, note, message, author }),
  });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status === 200) {
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(interpreted.body));
    } catch {
      return { outcome: 'error', message: '/v1/redirects did not return valid JSON' };
    }
    const record = body as Record<string, unknown> | null;
    const entry = record?.entry;
    const retargeted = record?.retargeted;
    if (!isRedirectEntry(entry) || !Array.isArray(retargeted) || !retargeted.every(isRedirectEntry)) {
      return { outcome: 'error', message: '/v1/redirects did not return the expected shape' };
    }
    return { outcome: 'ok', entry, retargeted };
  }
  if (interpreted.status === 400) {
    return { outcome: 'invalid', message: readErrorMessage(interpreted.body, 'That redirect is not valid') };
  }
  if (interpreted.status === 404) {
    return { outcome: 'not-found', message: readErrorMessage(interpreted.body, 'No redirect found at that path') };
  }
  if (interpreted.status === 409) {
    return { outcome: 'conflict', message: readErrorMessage(interpreted.body, 'That redirect already exists') };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/redirects (${interpreted.status})` };
}

export async function createSiteRedirect(
  site: Pick<Site, 'url' | 'token'>,
  from: string,
  to: string,
  note: string | undefined,
  message: string,
  author: CommitAuthor,
  options: SiteRedirectsOptions = {},
): Promise<UpsertSiteRedirectResult> {
  return upsertSiteRedirect('POST', site, from, to, note, message, author, options);
}

// PUT matches the existing entry by `from` - there is no rename-from
// operation, `from` is the entry's own key.
export async function updateSiteRedirect(
  site: Pick<Site, 'url' | 'token'>,
  from: string,
  to: string,
  note: string | undefined,
  message: string,
  author: CommitAuthor,
  options: SiteRedirectsOptions = {},
): Promise<UpsertSiteRedirectResult> {
  return upsertSiteRedirect('PUT', site, from, to, note, message, author, options);
}

export type DeleteSiteRedirectResult =
  | { outcome: 'ok' }
  | { outcome: 'not-found'; message: string }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export async function deleteSiteRedirect(
  site: Pick<Site, 'url' | 'token'>,
  from: string,
  message: string,
  author: CommitAuthor,
  options: SiteRedirectsOptions = {},
): Promise<DeleteSiteRedirectResult> {
  const result = await fetchSite(site, '/v1/redirects', {
    ...options,
    authToken: site.token,
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, message, author }),
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
    return { outcome: 'not-found', message: readErrorMessage(interpreted.body, 'No redirect found at that path') };
  }
  return { outcome: 'error', message: `Unexpected response from /v1/redirects (${interpreted.status})` };
}

// The agent's own error bodies carry a real, specific "message" (e.g.
// "That redirect would create a cycle") - preferred over a generic
// fallback whenever the body actually parses, same as this app's own
// reasonFromResponse (site-editor.ts, web side) already prefers
// message over a bare status phrase.
function readErrorMessage(body: ArrayBuffer, fallback: string): string {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    return typeof parsed.message === 'string' ? parsed.message : fallback;
  } catch {
    return fallback;
  }
}
