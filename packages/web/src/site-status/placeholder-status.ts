import type { EditorStatus } from '../editor/useAutosaveDraft.ts';
import type { SiteStatusAction, SiteStatusPanelProps } from './SiteStatusPanel.tsx';

export type PlaceholderStatus = 'loading' | 'not-found' | 'site-not-found' | 'load-error' | 'unreachable';

// One shared string, not left to each of the six screens to phrase for
// itself - the previous per-page wording ("SiteNotFoundError", the raw
// "No registered site with id ..." server message, or nothing at all)
// is exactly what prompted unifying this. sites/site-load-error.ts
// (the four list-style screens) imports this same constant, so the
// wording can never drift between the two.
export const SITE_NOT_FOUND_MESSAGE = 'This website could not be found. It may have been removed.';

// A type guard, not a boolean helper, so callers narrow `status` to
// PlaceholderStatus automatically wherever this returns true - both
// PageEditorPage.tsx and MenuEditorPage.tsx switch their tab content
// and preview panes on the result of this same check.
export function isPlaceholderStatus(status: EditorStatus): status is PlaceholderStatus {
  return (
    status === 'loading' ||
    status === 'not-found' ||
    status === 'site-not-found' ||
    status === 'load-error' ||
    status === 'unreachable'
  );
}

// Every PlaceholderStatus except 'loading' - that one is handled by
// TopLoadingBar.tsx instead (a fixed bar, not this panel), same as the
// four list-style screens, so callers branch on it before ever calling
// this, and it has nothing to return for that case.
export type ProblemStatus = Exclude<PlaceholderStatus, 'loading'>;

// Shared by PageEditorPage.tsx and MenuEditorPage.tsx - identical
// mapping in both (same useAutosaveDraft-driven status, same retry-via-
// reloadLatest), so this lives once rather than being copied twice.
// 'not-found' gets no actions - retrying or diagnosing can't fix
// content that's genuinely not there, unlike a real connectivity
// failure. 'site-not-found' is a different problem entirely (the site
// itself was removed from the registry, or access was revoked - the
// two are deliberately indistinguishable server-side, see
// require-site-access.ts) - Retry and Diagnose can't fix either one,
// only re-registering the site can, so it gets Manage Sites alone.
export function buildPlaceholderPanelProps(
  status: ProblemStatus,
  options: { errorMessage: string | null; siteId: string; onRetry: () => void },
): SiteStatusPanelProps {
  if (status === 'not-found') {
    return { variant: 'problem', message: 'No content found at this path.' };
  }
  if (status === 'site-not-found') {
    return { variant: 'problem', message: SITE_NOT_FOUND_MESSAGE, actions: [{ label: 'Manage Websites', href: '/settings/sites' }] };
  }

  const actions: SiteStatusAction[] = [
    { label: 'Retry', onClick: options.onRetry },
    { label: 'Diagnose', href: `/settings/sites/${options.siteId}` },
    { label: 'Manage Websites', href: '/settings/sites' },
  ];

  if (status === 'load-error') {
    return { variant: 'problem', message: options.errorMessage ?? 'Something went wrong loading this content.', actions };
  }

  return { variant: 'problem', message: options.errorMessage ?? 'Could not reach the website. Check back shortly.', actions };
}
