import { encodePathSegments, reasonFromResponse } from './site-editor.ts';

export interface ContentListEntry {
  path: string;
  name: string;
  title: string;
  type: string;
  published: boolean;
  hasDraft: boolean;
  url: string | null;
  changedAt: string | null;
}

export interface ContentListFilters {
  type?: string;
  draftStatus?: 'has-draft' | 'no-draft';
}

type SiteContentErrorReason = 'unreachable' | 'unauthorized' | 'site-not-found' | 'error';

export class SiteContentError extends Error {
  readonly reason: SiteContentErrorReason;

  constructor(reason: SiteContentErrorReason, message: string) {
    super(message);
    this.name = 'SiteContentError';
    this.reason = reason;
  }
}

function isReason(value: unknown): value is SiteContentErrorReason {
  return value === 'unreachable' || value === 'unauthorized' || value === 'site-not-found' || value === 'error';
}

export async function listSiteContent(siteId: string, filters: ContentListFilters): Promise<ContentListEntry[]> {
  const params = new URLSearchParams();
  if (filters.type) {
    params.set('type', filters.type);
  }
  if (filters.draftStatus) {
    params.set('draftStatus', filters.draftStatus);
  }
  const query = params.toString();

  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/content${query ? `?${query}` : ''}`);

  if (!response.ok) {
    let reason: SiteContentErrorReason = 'error';
    let message = 'Failed to load content';
    try {
      const body = (await response.json()) as { error?: string; message?: string; reason?: unknown };
      // message first, same reasoning as site-editor.ts's own
      // reasonFromResponse: "error" is just the generic status phrase
      // or, for a thrown domain error like SiteNotFoundError, the
      // class name itself (e.g. "SiteNotFoundError") - never anything
      // fit to show a user.
      message = body.message ?? body.error ?? message;
      if (isReason(body.reason)) {
        reason = body.reason;
      }
    } catch {
      // Use the defaults above - the body wasn't valid JSON.
    }
    throw new SiteContentError(reason, message);
  }

  return (await response.json()) as ContentListEntry[];
}

// path is content-relative (e.g. "pages/about.json"), matching
// readSiteEditorContent's own convention (site-editor.ts) - not a
// public url, since the admin's route forwards straight to the
// agent's own DELETE /v1/content/*path, which is content-relative too.
// Throws SiteEditorError (not this file's own SiteContentError) - the
// 'not-found'/'conflict'/'invalid' reasons a delete can genuinely
// return aren't in SiteContentError's own narrower reason set, and
// every other write endpoint in this app already throws SiteEditorError.
export async function deleteSitePage(siteId: string, path: string, message: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/content/${encodePathSegments(path)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (response.status === 404) {
    throw await reasonFromResponse(response, 'not-found');
  }
  // 'conflict' - the agent rejects deleting a page that still has
  // child pages outright rather than cascading (see this route's own
  // server-side comment) - reads the same as any other conflict this
  // app already surfaces (a stale tree, another editor's concurrent
  // change), so no dedicated reason of its own.
  if (response.status === 409) {
    throw await reasonFromResponse(response, 'conflict');
  }
  if (response.status === 400) {
    throw await reasonFromResponse(response, 'invalid');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
}
