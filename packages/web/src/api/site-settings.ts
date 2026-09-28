import { reasonFromResponse, SiteEditorError } from './site-editor.ts';

// Site settings: values for the settings the site's theme defines
// (theme/config/site_settings.json). Saved like a menu - committed and
// live at once, no draft.

export interface SiteSettingsData {
  // The theme's settings schema, or null when it defines none.
  schema: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  // The ETag a save must present; "*" while nothing has been saved yet.
  etag: string;
}

export async function fetchSiteSettings(siteId: string): Promise<SiteSettingsData> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/settings`);
  if (response.status === 404) {
    // Either the site isn't registered, or its CMS predates site
    // settings - the message says which.
    throw await reasonFromResponse(response, 'not-found');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, response.status === 502 ? 'unreachable' : 'error');
  }
  const body = (await response.json()) as { schema?: unknown; settings?: unknown };
  return {
    schema: typeof body.schema === 'object' && body.schema !== null ? (body.schema as Record<string, unknown>) : null,
    settings: typeof body.settings === 'object' && body.settings !== null ? (body.settings as Record<string, unknown>) : {},
    etag: response.headers.get('etag') ?? '*',
  };
}

// Resolves to the new ETag, for the next save.
export async function saveSiteSettings(siteId: string, settings: Record<string, unknown>, etag: string, message: string): Promise<string> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': etag },
    body: JSON.stringify({ settings, message }),
  });
  if (response.status === 409) {
    throw await reasonFromResponse(response, 'conflict');
  }
  if (response.status === 400) {
    throw await reasonFromResponse(response, 'invalid');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
  const newEtag = response.headers.get('etag');
  if (!newEtag) {
    throw new SiteEditorError('error', 'The website did not return a new ETag after saving');
  }
  return newEtag;
}
