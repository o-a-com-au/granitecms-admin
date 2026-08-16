import { encodePathSegments, reasonFromResponse } from './site-editor.ts';

// No new error class - SiteEditorErrorReason already covers every
// reason these calls need. The backend's own "not-found-at-ref"
// reason collapses to this file's existing "not-found" bucket at this
// final layer - the distinction still lives in the HTTP status and
// message text at every layer below.

export interface HistoryCommit {
  hash: string;
  author: { name: string; email: string };
  date: string;
  message: string;
  isCheckpoint: boolean;
}

export interface HistoryResult {
  commits: HistoryCommit[];
  hasMore: boolean;
}

// H1: scoped to a single page's path.
export async function fetchPageHistory(siteId: string, path: string, limit: number): Promise<HistoryResult> {
  const query = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(
    `/api/sites/${encodeURIComponent(siteId)}/history/${encodePathSegments(path)}?${query.toString()}`,
  );

  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
  return (await response.json()) as HistoryResult;
}

// H4: always creates a new commit on the agent side - history is
// never rewritten.
export async function revertPageToRevision(siteId: string, ref: string, path: string, message: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, path, message }),
  });

  if (response.status === 400) {
    throw await reasonFromResponse(response, 'invalid');
  }
  if (response.status === 404) {
    throw await reasonFromResponse(response, 'not-found');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
}
