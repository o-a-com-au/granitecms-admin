import { reasonFromResponse } from './site-editor.ts';

export interface RedirectEntry {
  from: string;
  to: string;
  note?: string;
}

export interface ListSiteRedirectsResult {
  entries: RedirectEntry[];
}

export async function listSiteRedirects(siteId: string): Promise<ListSiteRedirectsResult> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/redirects`);

  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
  return (await response.json()) as ListSiteRedirectsResult;
}

export interface UpsertSiteRedirectResult {
  entry: RedirectEntry;
  retargeted: RedirectEntry[];
}

async function upsertSiteRedirect(
  method: 'POST' | 'PUT',
  siteId: string,
  from: string,
  to: string,
  note: string | undefined,
  message: string,
): Promise<UpsertSiteRedirectResult> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/redirects`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, note, message }),
  });

  if (response.status === 400) {
    throw await reasonFromResponse(response, 'invalid');
  }
  if (response.status === 404) {
    throw await reasonFromResponse(response, 'not-found');
  }
  if (response.status === 409) {
    throw await reasonFromResponse(response, 'conflict');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
  return (await response.json()) as UpsertSiteRedirectResult;
}

export function createSiteRedirect(
  siteId: string,
  from: string,
  to: string,
  note: string | undefined,
  message: string,
): Promise<UpsertSiteRedirectResult> {
  return upsertSiteRedirect('POST', siteId, from, to, note, message);
}

// PUT matches the existing entry by `from` - there is no rename-from
// operation, `from` is the entry's own key.
export function updateSiteRedirect(
  siteId: string,
  from: string,
  to: string,
  note: string | undefined,
  message: string,
): Promise<UpsertSiteRedirectResult> {
  return upsertSiteRedirect('PUT', siteId, from, to, note, message);
}

export async function deleteSiteRedirect(siteId: string, from: string, message: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/redirects`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, message }),
  });

  if (response.status === 404) {
    throw await reasonFromResponse(response, 'not-found');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
}
