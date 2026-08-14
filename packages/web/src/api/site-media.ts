import { reasonFromResponse } from './site-editor.ts';

export interface MediaItem {
  name: string;
  size: number;
  mtimeMs: number;
  url: string;
}

export interface ListSiteMediaResult {
  items: MediaItem[];
  maxUploadBytes: number;
}

export async function listSiteMedia(siteId: string): Promise<ListSiteMediaResult> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/media`);

  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
  return (await response.json()) as ListSiteMediaResult;
}

// The upload response has no mtimeMs (the backend's own POST doesn't
// report it, only GET's list does) - a distinct, narrower shape rather
// than a fabricated MediaItem, matching the same split already made
// server-side in site-media.ts's isUploadResult.
export interface UploadedMediaItem {
  name: string;
  size: number;
  url: string;
}

export async function uploadSiteMedia(siteId: string, file: File): Promise<UploadedMediaItem> {
  const form = new FormData();
  form.append('file', file);

  // No Content-Type header here - the browser's own fetch computes the
  // multipart boundary itself for a FormData body, same reason as the
  // admin backend's own fetch-site.ts.
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/media`, {
    method: 'POST',
    body: form,
  });

  if (response.status === 415) {
    throw await reasonFromResponse(response, 'unsupported-type');
  }
  if (response.status === 413) {
    throw await reasonFromResponse(response, 'too-large');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
  return (await response.json()) as UploadedMediaItem;
}

export async function deleteSiteMedia(siteId: string, name: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/media/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });

  if (response.status === 404) {
    throw await reasonFromResponse(response, 'not-found');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
}
