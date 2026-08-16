import { Navigate } from 'react-router';
import { readLastSiteId, resolveEditorHref } from '../sites/currentSite.ts';

// "/" is never rendered directly for an authenticated visitor - it's
// always an immediate redirect, either into whichever site's editor
// was last visited (readLastSiteId, remembered by AppShell on every
// site-scoped route) or, on a genuinely first-ever visit with no site
// known yet, to the site registry at /settings.
export function HomeRedirect() {
  const lastSiteId = readLastSiteId();
  return <Navigate to={lastSiteId ? resolveEditorHref(lastSiteId) : '/settings'} replace />;
}
