import { Link, useNavigate } from 'react-router';
import { useSites } from '../../sites/useSites.ts';
import { SiteConnectionPanel } from '../../sites/SiteConnectionPanel.tsx';
import { readLastSiteId, writeLastSiteId } from '../../sites/currentSite.ts';

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

  // Same "make this the current site, then go there" move
  // RegisterSitePage.tsx does right after registering - Switch is
  // just that same action for a site that's already registered.
  function handleSwitch(siteId: string): void {
    writeLastSiteId(siteId);
    navigate('/');
  }

  return (
    <section>
      <h2>Active websites</h2>
      {error && <p role="alert">{error}</p>}
      {sites === null && !error && <p>Loading...</p>}
      {sites !== null && sites.length === 0 && <p>Nothing registered yet.</p>}
      {sites !== null && sites.length > 0 && (() => {
        // The last site actually worked in, falling back to the first
        // registered one so there's always an expanded card to show -
        // a brand new registration (no "last site" remembered yet)
        // shouldn't render every site as a plain collapsed row.
        const lastSiteId = readLastSiteId();
        const activeSite = sites.find((site) => site.id === lastSiteId) ?? sites[0]!;
        const otherSites = sites.filter((site) => site.id !== activeSite.id);

        return (
          <ul className="website-status-list">
            <li className="website-status-card">
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
                  <Link to={`/settings/sites/${activeSite.id}`} className="settings-manage-link">
                    Manage
                  </Link>
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
                  <button type="button" onClick={() => handleSwitch(site.id)}>
                    Switch
                  </button>
                  <Link to={`/settings/sites/${site.id}`} className="settings-manage-link">
                    Manage
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        );
      })()}
      <Link to="/settings/sites/new" className="settings-add-website-link">
        + Add Website
      </Link>
    </section>
  );
}
