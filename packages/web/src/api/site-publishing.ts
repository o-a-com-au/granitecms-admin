import { encodePathSegments, reasonFromResponse } from './site-editor.ts';

// No new error class - SiteEditorErrorReason already covers every
// reason these three calls need (invalid, not-found, unreachable,
// unauthorized, error), and all three operate on the same content
// path as site-editor.ts's own calls for the same page.

// G1: single-page publish - the browser only ever sends one path and
// a commit message; the admin route wraps this into the agent's own
// batch shape and supplies the commit author server-side.
export async function publishSiteDraft(siteId: string, path: string, message: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, message }),
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

// G3: idempotent on the agent side - always resolves, never a
// not-found case of its own.
export async function discardSiteDraft(siteId: string, path: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/drafts/${encodePathSegments(path)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
}

// G4: sets published:false on the live page in place - the same
// error shape as publish (invalid/not-found/else).
export async function unpublishSitePage(siteId: string, path: string, message: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/unpublish/${encodePathSegments(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
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

// Backs the Slug field's rename-on-save (PageMetadataPanel.tsx) and the
// page tree's drag-to-reparent feature (PagesTabPanel.tsx). from/to are
// page URLs ("/about"), not content paths - both call sites already
// hold the page's current url, not its content path. "conflict" (409)
// is reused for "a page already exists at that destination slug"
// rather than adding a new reason - it's the same "something else is
// already there" shape the rest of this file's reasons already cover.
// createRedirect defaults false, matching the Slug field's own
// WordPress-style "no automatic redirect" rename - the reparent call
// site passes true, since moving a page under a different parent
// changes its whole URL prefix, not just its final slug.
export async function moveSitePage(siteId: string, from: string, to: string, message: string, createRedirect = false): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, message, createRedirect }),
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
}
