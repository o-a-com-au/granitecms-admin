import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { useSites } from '../sites/useSites.ts';
import { readLastSiteId, resolveEditorHref } from '../sites/currentSite.ts';

// A client with no remembered site (their very first login, or a
// fresh browser) has nowhere else to land - /settings is developer-
// only (RequireDeveloper), so falling back there the way a developer
// does would bounce straight back to "/" and loop forever. Fetches
// their real site list and lands on the first one instead.
function ClientLanding() {
  const { sites, error } = useSites();

  if (sites === null && !error) {
    return null;
  }
  if (sites && sites.length > 0) {
    return <Navigate to={resolveEditorHref(sites[0]!.id)} replace />;
  }
  // Genuinely unreachable in practice (a client account only ever
  // exists via being granted at least one site), but not asserted
  // away - shown plainly rather than risking another redirect loop.
  return <p>No sites are available for this account yet.</p>;
}

// "/" is never rendered directly for an authenticated visitor - it's
// always an immediate redirect, either into whichever site's editor
// was last visited (readLastSiteId, remembered by AppShell on every
// site-scoped route) or, on a genuinely first-ever visit with no site
// known yet, to the site registry at /settings/sites - developer
// only. Not the bare /settings (which now defaults to Personal
// Details, not the registry) - a first-time developer's only useful
// destination here is actually registering a site.
export function HomeRedirect() {
  const { user } = useAuth();
  const lastSiteId = readLastSiteId();

  if (lastSiteId) {
    return <Navigate to={resolveEditorHref(lastSiteId)} replace />;
  }

  if (user?.role !== 'developer') {
    return <ClientLanding />;
  }

  return <Navigate to="/settings/sites" replace />;
}
