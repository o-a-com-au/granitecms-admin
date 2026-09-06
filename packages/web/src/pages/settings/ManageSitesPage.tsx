import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSites } from '../../sites/useSites.ts';
import { SiteConnectionPanel } from '../../sites/SiteConnectionPanel.tsx';
import { readLastSiteId, resolveEditorHref, writeLastSiteId } from '../../sites/currentSite.ts';
import { AddIcon } from '../../sections/AddIcon.tsx';

// Single-use icon (only ever rendered here) - same convention
// IconRail.tsx already established for its own single-use icons.
// Mirrors SettingsLayout.tsx's own local GlobeIcon exactly rather than
// importing it - that one is private to this app's nav rail, not
// exported for reuse, matching the general pattern of small icons
// living wherever they're drawn rather than a shared file nobody else
// needs.
function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

// Developer-only (App.tsx wraps this route in RequireDeveloper) - a
// client never registers or owns a site. Registration now lives on its
// own route (RegisterSitePage.tsx, "+ Add Website" below) - this page
// is purely the registry: whichever site was last active gets the full
// status card, everything else is a compact row to switch into.
// Always shows the normal Settings-shell view, even with zero sites
// registered - a developer who deliberately navigated here via
// Settings > Manage Websites wants the registry, not the bare first-run
// welcome screen (OnboardingPage.tsx, reached only via HomeRedirect's
// own "/" landing logic).
export function ManageSitesPage() {
  const { sites, error } = useSites();
  const navigate = useNavigate();
  // Seeded from localStorage once, then updated locally on Activate -
  // readLastSiteId() only reads localStorage, it doesn't observe it,
  // so calling writeLastSiteId() alone wouldn't re-render this page
  // with the newly-activated site's own card expanded (requested
  // directly: Activate should just change which card is active here,
  // not navigate away the way registering a new site or Edit Content
  // do).
  const [activeSiteId, setActiveSiteId] = useState(() => readLastSiteId());

  // Makes this site "the" current one (same remembered value
  // AppShell's own top bar, PreviewContext etc all read) without
  // leaving this page - Edit Content below is the one action that
  // actually takes you into it.
  function handleActivate(siteId: string): void {
    writeLastSiteId(siteId);
    setActiveSiteId(siteId);
  }

  function handleEditContent(siteId: string): void {
    writeLastSiteId(siteId);
    navigate(resolveEditorHref(siteId));
  }

  return (
    <section>
      <h2>Active websites</h2>
      {error && <p role="alert">{error}</p>}
      {sites === null && !error && <p>Loading...</p>}
      {sites !== null && sites.length === 0 && <p>Nothing registered yet.</p>}
      {sites !== null && sites.length > 0 && (() => {
        // The site last switched/registered into, falling back to the
        // first registered one so there's always an expanded card to
        // show - a brand new registration (no "last site" remembered
        // yet) shouldn't render every site as a plain collapsed row.
        const activeSite = sites.find((site) => site.id === activeSiteId) ?? sites[0]!;
        const otherSites = sites.filter((site) => site.id !== activeSite.id);

        return (
          <ul className="website-status-list">
            {/* Keyed on the active site's own id, not a stable literal
                key - Activate should read as visibly switching to a
                different site (requested directly, a fade-in
                transition), not the same card silently swapping its
                own text out from under you. Remounting on every
                activation is what makes that happen for free (a fresh
                mount replays this card's own entrance animation,
                below, and SiteConnectionPanel's own "just activated"
                checking beat, both restarting exactly when this key
                changes), rather than needing a separate token/effect
                to detect "something changed" the way a stable key
                wouldn't. */}
            <li className="website-status-card" key={activeSite.id}>
              <div className="website-status-card-header">
                <span className="website-status-domain">
                  <GlobeIcon />
                  {activeSite.url}
                </span>
                <span className="website-status-active-badge">
                  <span className="website-status-dot" aria-hidden="true" />
                  Active
                </span>
              </div>
              <div className="website-status-card-body">
                <div className="website-status-card-main">
                  <dl className="website-status-meta">
                    {activeSite.status.state === 'ok' && (
                      <>
                        <div>
                          <dt>Agent</dt>
                          <dd>{activeSite.status.agentVersion}</dd>
                        </div>
                        <div>
                          <dt>Schema</dt>
                          <dd>v{activeSite.status.contentSchemaVersion}</dd>
                        </div>
                        <div>
                          <dt>Node</dt>
                          <dd>{activeSite.status.sqliteDriver}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                  <div className="website-status-card-actions">
                    <button type="button" onClick={() => handleEditContent(activeSite.id)}>
                      Edit Content
                    </button>
                    <Link to={`/settings/sites/${activeSite.id}`} className="button-primary">
                      Manage
                    </Link>
                  </div>
                </div>
                <SiteConnectionPanel status={activeSite.status} />
              </div>
            </li>
            {otherSites.map((site) => (
              <li key={site.id} className="website-status-row">
                <span className="website-status-domain">
                  <GlobeIcon />
                  {site.url}
                </span>
                <div className="website-status-row-actions">
                  <button type="button" onClick={() => handleActivate(site.id)}>
                    Activate
                  </button>
                  <Link to={`/settings/sites/${site.id}`} className="button-primary">
                    Manage
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        );
      })()}
      <Link to="/settings/sites/new" className="settings-add-website-link">
        <AddIcon />
        Add Website
      </Link>
    </section>
  );
}
