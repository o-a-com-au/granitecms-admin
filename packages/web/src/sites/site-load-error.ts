import type { SiteStatusAction } from '../site-status/SiteStatusPanel.tsx';
import { SITE_NOT_FOUND_MESSAGE } from '../site-status/placeholder-status.ts';
import { SiteEditorError } from '../api/site-editor.ts';

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
