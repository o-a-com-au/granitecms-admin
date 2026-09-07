import { Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { useSites } from '../sites/useSites.ts';
import { readLastSiteId, resolveEditorHref } from '../sites/currentSite.ts';

// Matches a site's own registered url (returned by GET /api/sites,
// already scoped to what this logged-in user can access - no new
// backend lookup or access-control surface needed) against the ?site=
// query param a site's own GET /admin redirect appends (the agent
// repo's routes/admin-redirect.ts uses request.host, so this compares
// host, not the full URL - scheme/path differences don't matter).
// Malformed stored data shouldn't crash this page - a site with an
// unparseable url just never matches.
function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// "/" is never rendered directly for an authenticated visitor - it's
// always an immediate redirect, either into whichever site's editor
// was last visited (readLastSiteId, remembered by AppShell on every
// site-scoped route) or, on a genuinely first-ever visit with no site
// known yet, to the bare first-run welcome screen at /onboarding -
// developer only (a client's fallback is landing on their first real
// site instead, below - /settings and /onboarding are both developer-
// only, so falling back there the way a developer does would bounce
// straight back to "/" and loop forever). /onboarding is deliberately
// distinct from Settings > Manage Sites (ManageSitesPage.tsx, reached
// by deliberately navigating there, which always shows the normal
// registry view even with zero sites) - this route is only ever this
// automatic "/" landing.
//
// Always fetches the real site list first, rather than trusting
// readLastSiteId() blindly - that value is only ever cleared by
// writeLastSiteId itself (AppShell.tsx), never by a site actually
// being deleted elsewhere (another tab, the registry being wiped),
// so a stale id would otherwise send a returning visitor straight into
// a doomed /sites/:id/editor route instead of back to onboarding.
export function HomeRedirect() {
  const { user } = useAuth();
  const { sites, error } = useSites();
  const lastSiteId = readLastSiteId();
  const [searchParams] = useSearchParams();
  const siteParam = searchParams.get('site');

  if (sites === null && !error) {
    return null;
  }

  // Checked before the last-visited-site branch below: the whole
  // point of a site's own /admin link is "go straight into managing
  // this specific site," which should win over whatever was open
  // last. No match (including no ?site= at all) falls through to
  // every existing branch completely unchanged.
  const siteParamMatch = siteParam ? sites?.find((site) => hostOf(site.url) === siteParam) : undefined;
  if (siteParamMatch) {
    return <Navigate to={resolveEditorHref(siteParamMatch.id)} replace />;
  }

  const lastSiteStillExists = lastSiteId !== null && sites?.some((site) => site.id === lastSiteId);
  if (lastSiteStillExists) {
    return <Navigate to={resolveEditorHref(lastSiteId)} replace />;
  }

  if (user?.role === 'developer') {
    return <Navigate to="/onboarding" replace />;
  }

  if (sites && sites.length > 0) {
    return <Navigate to={resolveEditorHref(sites[0]!.id)} replace />;
  }
  // Genuinely unreachable in practice (a client account only ever
  // exists via being granted at least one site), but not asserted
  // away - shown plainly rather than risking another redirect loop.
  return <p>No websites are available for this account yet.</p>;
}
