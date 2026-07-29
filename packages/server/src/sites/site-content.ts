import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';

export interface ContentListEntry {
  path: string;
  title: string;
  type: string;
  published: boolean;
  hasDraft: boolean;
}

export interface ContentListFilters {
  type?: string;
  prefix?: string;
  draftStatus?: 'has-draft' | 'no-draft';
}

// A 3-way failure reason, not the 4-way SiteStatus from
// site-status.ts - a different domain concept (a content-fetch
// failure, not a health check) that doesn't need SiteStatus's
// agentVersion/contentSchemaVersion/sqliteDriver fields.
export type SiteContentResult =
  | { outcome: 'ok'; entries: ContentListEntry[] }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

function buildQueryString(filters: ContentListFilters): string {
  const params = new URLSearchParams();
  if (filters.type) {
    params.set('type', filters.type);
  }
  if (filters.prefix) {
    params.set('prefix', filters.prefix);
  }
  if (filters.draftStatus) {
    params.set('draftStatus', filters.draftStatus);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function isContentListEntry(value: unknown): value is ContentListEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === 'string' &&
    typeof record.title === 'string' &&
    typeof record.type === 'string' &&
    typeof record.published === 'boolean' &&
    typeof record.hasDraft === 'boolean'
  );
}

function isContentListEntryArray(value: unknown): value is ContentListEntry[] {
  return Array.isArray(value) && value.every(isContentListEntry);
}

export interface FetchSiteContentOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// One call, not site-status.ts's two: this is calling the real
// resource it actually wants, so that single call's own outcome
// (network failure, 401/403, non-2xx, malformed body, or success)
// already tells us everything needed - unlike a health check, there's
// no separate "prove this is really a cms-agent instance" step to
// establish first.
export async function fetchSiteContent(
  site: Pick<Site, 'url' | 'token'>,
  filters: ContentListFilters,
  options: FetchSiteContentOptions = {},
): Promise<SiteContentResult> {
  const path = `/v1/content${buildQueryString(filters)}`;
  const result = await fetchSite(site, path, { ...options, authToken: site.token });

  if (result.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  const response = result.response;

  // requireScope on the agent side can return 401 (missing/invalid
  // token) or 403 (valid token, wrong scope) - both are the same
  // problem from the operator's point of view.
  if (response.status === 401 || response.status === 403) {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }

  if (!response.ok) {
    return { outcome: 'error', message: `Unexpected response from /v1/content (${response.status})` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { outcome: 'error', message: '/v1/content did not return valid JSON' };
  }

  if (!isContentListEntryArray(body)) {
    return { outcome: 'error', message: '/v1/content did not return a content list' };
  }

  return { outcome: 'ok', entries: body };
}
