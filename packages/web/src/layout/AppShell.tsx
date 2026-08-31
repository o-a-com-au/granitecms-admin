import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { formatFullName } from '../auth/fullName.ts';
import { useTheme } from '../theme/ThemeContext.tsx';
import { IconSprite } from '../icons/index.tsx';
import { GraniteLogo } from './GraniteLogo.tsx';
import { IconRail } from './IconRail.tsx';
import { PageActionsProvider, PageDeviceToggleProvider, PagePathProvider } from './PageActionsContext.tsx';
import { PreviewProvider, usePreview } from './PreviewContext.tsx';
import { PreviewFrame } from '../editor/PreviewFrame.tsx';
import { useSites } from '../sites/useSites.ts';
import { readLastSiteId, resolveEditorHref, writeLastSiteId } from '../sites/currentSite.ts';

// Bumped by hand alongside any release worth surfacing in the brand
// mark - not derived from package.json, whose own version has stayed
// at the 0.0.0 placeholder throughout development and isn't meant for
// display.
const APP_VERSION = '2.3';

// Falls back to the raw stored URL for the rare case it isn't a valid
// URL at all (e.g. mid-edit in the registry) - the popover's "Switch
// site" list/dropdown is meant to read as a short hostname either way,
// never throw.
function hostLabelFor(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// SiteListEntry.url is a registered origin, e.g. "http://host:3891" -
// but new URL() always normalises a bare origin to include a trailing
// slash ("http://host:3891/"), so a naive concatenation with path
// (which always starts with its own leading slash) can end up
// "host:3891//about". Stripping any trailing slash first guarantees
// exactly one, regardless of which form this particular domain was
// stored in. "/" itself is the site's own root, not a real segment to
// append - joining it verbatim would show a bare trailing slash for
// every site's homepage.
function joinDomainAndPath(domain: string, path: string | null): string {
  if (path === null || path === '/') {
    return domain.replace(/\/$/, '');
  }
  return domain.replace(/\/$/, '') + path;
}

// A generic Feather-style "external link" glyph, not one of
// IconSprite's own baked, multi-colour design icons (icons/index.tsx) -
// this is a plain currentColor utility affordance, not a piece of the
// design system's dedicated icon set, so it doesn't belong in that
// sprite alongside them.
function ExternalLinkIcon() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// A plain globe glyph for the new address bar - same "generic
// currentColor utility icon" reasoning as ExternalLinkIcon above, not
// one of the design system's own baked-colour icons.
function GlobeIcon() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

// The one persistent live-preview viewport (PreviewContext.tsx),
// rendered as a sibling of .app-content rather than inside it - the
// point is that it survives whatever the Outlet swaps in underneath it.
// Renders nothing at all until a route actually asks for it
// (usePreviewVisible(true)) - Settings and any other non-preview route
// simply never does, so this stays hidden there without needing to know
// anything about the current route itself.
function SharedPreviewRegion({ siteId }: { siteId: string }) {
  const { visible, previewUrl, device, revisionRef, status, iframeRef, frameHandlers, fieldsPanel, mobileOpen, previewOverlay } =
    usePreview();

  if (!visible) {
    return null;
  }

  return (
    <div className={`shared-preview-region${mobileOpen ? ' is-open-mobile' : ''}`}>
      <div className={`preview-viewport-wrap${fieldsPanel !== null ? ' has-fields-panel' : ''}`}>
        <PreviewFrame
          siteId={siteId}
          url={previewUrl}
          status={status}
          device={device}
          revisionRef={revisionRef}
          iframeRef={iframeRef}
          onFrameLoad={frameHandlers.onFrameLoad}
          onFrameMouseLeave={frameHandlers.onFrameMouseLeave}
        />
        {previewOverlay}
      </div>
      {fieldsPanel}
    </div>
  );
}

// Wraps every authenticated route as one shared layout: a left icon
// rail (IconRail.tsx - Editor/Pages/Media, replacing the previous
// horizontal top-bar nav) plus a top bar carrying the current page's
// address (in place of the old nav-links span - a plain display for
// now, not yet clickable/searchable, deliberately deferred), the
// device-size toggle, an account popover, and two slots leaf routes
// can push content into: page actions (PageEditorPage's own Save/
// Discard) and the device-size toggle (see PageActionsContext.tsx).
//
// siteId comes from a plain useParams() call, not pathname parsing:
// react-router's useParams() returns the deepest matched route's
// cumulative params regardless of which component in the tree calls
// it (verified directly against the installed react-router source),
// so this layout route sees the same siteId the leaf routes below it
// already read, with no extra plumbing.
export function AppShell() {
  const { siteId } = useParams<{ siteId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const [pageActions, setPageActions] = useState<ReactNode>(null);
  const [deviceToggle, setDeviceToggle] = useState<ReactNode>(null);
  const [pagePath, setPagePath] = useState<ReactNode>(null);
  const { sites, error: sitesError, refresh: refreshSites } = useSites();

  // Dismiss on an outside click - the popover has no backdrop of its
  // own (docs/design/Account Logout.png shows it floating directly
  // over the page content), so this is the only way to close it
  // without picking Logout. Also dismisses on window blur: this bar
  // renders on every authenticated route, including the editor, whose
  // live preview is an iframe - a click landing inside it is a
  // separate document and never bubbles a mousedown up here, but it
  // does blur this window.
  useEffect(() => {
    if (!accountOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent): void {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    function handleWindowBlur(): void {
      setAccountOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [accountOpen]);

  // The entire mechanism for "remember the current site" (currentSite.ts) -
  // every site-scoped route this shell wraps re-records itself here, no
  // per-page plumbing needed. "/" and the always-visible Editor nav item
  // both read this back once siteId itself isn't in the URL.
  //
  // Also refreshes this shell's own sites list here - AppShell is the
  // persistent layout (it never remounts on in-app navigation), so its
  // useSites() call only ever fetched once, on first mount, before a
  // fresh first-run registration (OnboardingPage.tsx, a completely
  // separate component with no way to reach back into this one) added
  // any site at all. Landing on a real site-scoped route for the first
  // time, right after registering, is exactly the moment that stale
  // empty list needs to catch up - found live: the top nav stayed
  // hidden after registering, even though a real site now existed,
  // until a full reload remounted this shell and refetched.
  useEffect(() => {
    if (siteId) {
      writeLastSiteId(siteId);
      void refreshSites();
    }
  }, [siteId, refreshSites]);

  const initial = user?.username ? user.username[0]?.toUpperCase() : '?';

  // Genuinely nothing to navigate to yet, not just "no site currently
  // selected" - every rail item would render disabled (IconRailItem's
  // own fallback) or, worse, pointing at a stale remembered siteId
  // (readLastSiteId()) that no longer exists. sites === null (still
  // loading) stays false here, not true - the rail starting empty and
  // then appearing once the fetch confirms real sites exist is a
  // normal, expected loading pattern; briefly showing it optimistically
  // and then hiding it again for a genuinely empty registry (found
  // live) reads as broken, not as a loading state.
  const hasSites = sites !== null && sites.length > 0;

  // The logo/wordmark slot shows this site's own address instead of
  // the plain brand mark whenever a route is genuinely scoped to one
  // (siteId itself in the URL) - unlike editorTo/contentTo/etc. below,
  // this deliberately does NOT fall back to the last-visited site while
  // on a route with no site in the URL at all (e.g. /settings), where
  // showing some other site's address next to unrelated content would
  // be misleading rather than helpful.
  const currentSite = siteId ? (sites?.find((site) => site.id === siteId) ?? null) : null;
  const pagePathStr = typeof pagePath === 'string' ? pagePath : null;
  const siteAddressLabel = currentSite ? joinDomainAndPath(hostLabelFor(currentSite.url), pagePathStr) : null;
  const siteLiveHref = currentSite ? joinDomainAndPath(currentSite.url, pagePathStr) : null;

  const editorTo = siteId ? `/sites/${siteId}/editor` : undefined;
  const isEditingPage = location.pathname === editorTo;
  // Falls back to the last-visited site (e.g. while on /settings, where
  // siteId itself isn't in the URL) so every rail item stays a real
  // link from anywhere, not just while a site is already selected in
  // the URL. undefined only on a genuine first-ever visit, before any
  // site has ever been known - IconRailItem renders that as disabled.
  const effectiveSiteId = siteId ?? readLastSiteId();
  const contentTo = effectiveSiteId ? `/sites/${effectiveSiteId}/content` : undefined;
  const mediaTo = effectiveSiteId ? `/sites/${effectiveSiteId}/media` : undefined;
  const editorNavTo = isEditingPage
    ? `${location.pathname}${location.search}`
    : effectiveSiteId
      ? resolveEditorHref(effectiveSiteId)
      : undefined;

  async function handleLogout(): Promise<void> {
    setAccountOpen(false);
    await logout();
  }

  // Refreshes on every open, not just once on mount - AppShell is the
  // persistent layout (it never remounts on in-app navigation), so its
  // own copy of the site list would otherwise silently drift from
  // SettingsPage's own after a register/rotate/remove there. Doubles as
  // how a freshly-registered site shows up in "Switch site" without a
  // manual reload.
  function handleToggleAccount(): void {
    setAccountOpen((current) => {
      if (!current) {
        void refreshSites();
      }
      return !current;
    });
  }

  return (
    <>
      <IconSprite />
      <div className="app-shell">
        <header className="app-topbar">
          <div className="app-topbar-start">
            <Link className="app-logo" to="/" title="Granite CMS">
              <span className="app-logo-mark">
                <GraniteLogo />
              </span>
              <span className="app-logo-word">
                GRANITE<span className="app-logo-version">{APP_VERSION}</span>
              </span>
            </Link>
          </div>
          {/* The new address bar - a static display of the current
              page's address (site domain + path, from the same
              usePagePath chrome slot the old logo-slot label already
              read) plus the device-size toggle, replacing the old
              nav-links span. Not yet clickable/searchable - that's a
              deliberately later enhancement, hence the title hint. */}
          <div className="app-topbar-address-bar" title={siteAddressLabel ?? undefined}>
            <span className="app-address-bar-icon" aria-hidden="true">
              <GlobeIcon />
            </span>
            <span className="app-address-bar-label">{siteAddressLabel ?? 'No site selected'}</span>
            {siteAddressLabel && siteLiveHref && (
              <a
                className="app-address-bar-external-link"
                href={siteLiveHref}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${siteAddressLabel} in a new tab`}
                aria-label={`Open ${siteAddressLabel} in a new tab`}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLinkIcon />
              </a>
            )}
            <div className="app-topbar-device-toggle">{deviceToggle}</div>
          </div>
          <div className="app-topbar-end">
            <div className="app-topbar-actions">{pageActions}</div>
            <div className="nav-rail-account" ref={accountRef}>
              {accountOpen && (
                <div className="account-popover" role="menu">
                  <div className="account-popover-header">
                    <span className="app-avatar" aria-hidden="true">
                      {initial}
                      <span className="app-avatar-status" />
                    </span>
                    <div className="account-popover-identity">
                      <p className="account-popover-name">{(user && formatFullName(user.firstName, user.lastName)) || user?.username}</p>
                      <p className="account-popover-email">{user?.email}</p>
                    </div>
                  </div>
                  {/* docs/design/User-context-menu.png - a dropdown once
                      there's more than one site to switch between (a
                      plain list doesn't scale, and the mockup itself
                      shows a select-styled control); with only one
                      site there's nothing to actually switch to, so
                      that one stays the plain non-interactive
                      treatment it already had. */}
                  {sites !== null && sites.length > 1 && (
                    <div className="account-popover-sites">
                      <p className="account-popover-sites-label">Switch site</p>
                      <select
                        className="account-popover-site-select"
                        aria-label="Switch site"
                        value={effectiveSiteId ?? ''}
                        onChange={(event) => {
                          const nextSiteId = event.target.value;
                          setAccountOpen(false);
                          navigate(resolveEditorHref(nextSiteId));
                        }}
                      >
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {hostLabelFor(site.url)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {sites !== null && sites.length === 1 && (
                    <div className="account-popover-sites">
                      <p className="account-popover-sites-label">Switch site</p>
                      <span className="account-popover-item is-current" aria-current="page">
                        {hostLabelFor(sites[0]!.url)}
                      </span>
                    </div>
                  )}
                  {sites === null && !sitesError && (
                    <span className="account-popover-item account-popover-item-muted" aria-disabled="true">
                      Loading sites...
                    </span>
                  )}
                  {sitesError && (
                    <span className="account-popover-item account-popover-item-muted" role="alert">
                      Couldn&apos;t load sites
                    </span>
                  )}
                  <Link to="/settings/personal" role="menuitem" className="account-popover-item" onClick={() => setAccountOpen(false)}>
                    Account Settings
                  </Link>
                  <button type="button" role="menuitem" className="account-popover-item" onClick={toggleTheme}>
                    {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="account-popover-item"
                    onClick={() => void handleLogout()}
                  >
                    Logout
                  </button>
                </div>
              )}
              <button
                type="button"
                className="app-avatar"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                onClick={handleToggleAccount}
                title={user ? user.username : 'Account'}
              >
                {initial}
                <span className="app-avatar-status" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>
        <div className="app-shell-body">
          {hasSites && (
            <IconRail
              editorTo={editorNavTo}
              isEditingPage={isEditingPage}
              contentTo={contentTo}
              isOnContent={location.pathname === contentTo}
              mediaTo={mediaTo}
              isOnMedia={location.pathname === mediaTo}
            />
          )}
          <PreviewProvider siteId={effectiveSiteId ?? ''}>
            <div className="app-content">
              <PageActionsProvider setActions={setPageActions}>
                <PageDeviceToggleProvider setDeviceToggle={setDeviceToggle}>
                  <PagePathProvider setPagePath={setPagePath}>
                    <Outlet />
                  </PagePathProvider>
                </PageDeviceToggleProvider>
              </PageActionsProvider>
            </div>
            <SharedPreviewRegion siteId={effectiveSiteId ?? ''} />
          </PreviewProvider>
        </div>
      </div>
    </>
  );
}
