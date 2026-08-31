import type { SiteStatusAction } from '../site-status/SiteStatusPanel.tsx';
import { SITE_NOT_FOUND_MESSAGE } from '../site-status/placeholder-status.ts';
import { SiteEditorError } from '../api/site-editor.ts';
import type { SiteListEntry } from '../api/sites.ts';

export interface LoadError {
  reason: 'unreachable' | 'unauthorized' | 'site-not-found' | 'error';
  message: string;
}

// useSiteRedirects.ts/useSiteMedia.ts's own listSiteRedirects/
// listSiteMedia both throw a SiteEditorError (api/site-editor.ts) on
// failure, same as everything else site-scoped - this narrows its
// wider reason set (which also covers save/upload-specific reasons
// like 'conflict'/'too-large' that can never come back from a plain
// list fetch) down to the ones a LoadError actually knows how to show.
export function toLoadError(err: unknown): LoadError {
  if (err instanceof SiteEditorError && (err.reason === 'unreachable' || err.reason === 'unauthorized' || err.reason === 'site-not-found')) {
    return { reason: err.reason, message: err.message };
  }
  return { reason: 'error', message: err instanceof Error ? err.message : 'Something went wrong' };
}

// Derives the same LoadError shape from the site REGISTRY itself
// (useSites.ts's own list, already fetched by AppShell for the site
// switcher popover), rather than from a specific content/list fetch
// failing - this is what lets AppShell drive a graceful SiteStatusPanel
// in the shared preview viewport (PreviewContext.tsx's
// SharedPreviewRegion) for every route that shows it, not just the ones
// that happen to fetch site-scoped content themselves. null while
// `sites` is still loading (nothing to show yet) or once a real,
// healthy site is found - both cases fall through to whatever the
// caller would normally render.
export function toSiteLoadError(sites: SiteListEntry[] | null, siteId: string): LoadError | null {
  if (sites === null || siteId === '') {
    return null;
  }
  const site = sites.find((entry) => entry.id === siteId);
  if (!site) {
    return { reason: 'site-not-found', message: SITE_NOT_FOUND_MESSAGE };
  }
  if (site.status.state === 'ok') {
    return null;
  }
  return { reason: site.status.state, message: site.status.message };
}

export function loadErrorMessage(error: LoadError): string {
  if (error.reason === 'unreachable') {
    return 'This site is unreachable right now.';
  }
  if (error.reason === 'unauthorized') {
    return "This site's token was rejected.";
  }
  if (error.reason === 'site-not-found') {
    return SITE_NOT_FOUND_MESSAGE;
  }
  return error.message;
}

// unauthorized deliberately gets no Retry - retrying with the same bad
// token can't succeed - and no Manage Sites, since Diagnose already
// takes you straight to the one place (this site's own Manage Site
// page) that can actually fix it (rotate the token). site-not-found
// gets only Manage Sites - unlike unauthorized, Diagnose isn't useful
// here either, since /settings/sites/:siteId would 404 the exact same
// way for a site that no longer exists.
export function buildLoadErrorActions(error: LoadError, siteId: string, onRetry: () => void): SiteStatusAction[] {
  if (error.reason === 'unauthorized') {
    return [{ label: 'Diagnose', href: `/settings/sites/${siteId}` }];
  }
  if (error.reason === 'site-not-found') {
    return [{ label: 'Manage Sites', href: '/settings/sites' }];
  }
  return [
    { label: 'Retry', onClick: onRetry },
    { label: 'Diagnose', href: `/settings/sites/${siteId}` },
    { label: 'Manage Sites', href: '/settings/sites' },
  ];
}
