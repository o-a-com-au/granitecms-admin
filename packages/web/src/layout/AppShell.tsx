import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { formatFullName } from '../auth/fullName.ts';
import { useTheme } from '../theme/ThemeContext.tsx';
import { IconSprite } from '../icons/index.tsx';
import { HamburgerIcon } from '../icons/HamburgerIcon.tsx';
import { GraniteLogo } from './GraniteLogo.tsx';
import { PageActionsProvider, PageDeviceToggleProvider, PagePathProvider } from './PageActionsContext.tsx';
import { useSites } from '../sites/useSites.ts';
import { readLastSiteId, resolveEditorHref, writeLastSiteId } from '../sites/currentSite.ts';

// Bumped by hand alongside any release worth surfacing in the brand
// mark (docs/designs/Phone-Pages.png shows the same "GRANITE 2.3"
// treatment already established for the mobile top bar) - not derived
// from package.json, whose own version has stayed at the 0.0.0
// placeholder throughout development and isn't meant for display.
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

interface TopNavItemProps {
  label: string;
  to: string | undefined;
  active: boolean;
}

// A nav item with no destination (siteId not yet known, e.g. on the
// registry) renders disabled rather than being omitted - the revised
// designs (docs/designs/Revised-Pages.png) show every nav item
// consistently present in the top bar.
function TopNavItem({ label, to, active }: TopNavItemProps) {
  if (!to) {
    return (
      <span className="app-topbar-nav-item" aria-disabled="true" title={`${label} (unavailable)`}>
        {label}
      </span>
    );
  }
  return (
    <Link className="app-topbar-nav-item" to={to} aria-current={active ? 'page' : undefined}>
      {label}
    </Link>
  );
}

// Wraps every authenticated route as one shared layout - a persistent
// top bar (docs/designs/Revised-Pages.png; replaces the previous left
// icon rail entirely) carrying primary nav, an account popover, and
// two slots leaf routes can push content into: page actions
// (PageEditorPage's own Save/Discard, previously pinned in its own
// footer only because there was no shared header for them to live in)
// and a device-size toggle (previously PreviewFrame's own, alongside
// an address-bar-style URL display this revision drops entirely - see
// PageActionsContext.tsx). The primary nav collapses behind a
// hamburger below the mobile breakpoint (docs/designs/Phone-Pages.png)
// - desktop always shows it inline, no hamburger there at all.
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  // A route change is always a deliberate nav pick (or a redirect
  // following one) - closing the mobile drawer here covers both
  // "tapped a link" and "navigated some other way while it happened
  // to be open" with the one effect, rather than wiring a close call
  // into every link individually.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

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
  // selected" - every nav item would render disabled (TopNavItem's own
  // fallback) or, worse, pointing at a stale remembered siteId
  // (readLastSiteId()) that no longer exists. sites === null (still
  // loading) stays false here, not true - the nav starting empty and
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
  // siteId itself isn't in the URL) so every nav item stays a real link
  // from anywhere, not just while a site is already selected in the
  // URL. undefined only on a genuine first-ever visit, before any site
  // has ever been known - TopNavItem renders that as disabled.
  const effectiveSiteId = siteId ?? readLastSiteId();
  const contentTo = effectiveSiteId ? `/sites/${effectiveSiteId}/content` : undefined;
  const menusTo = effectiveSiteId ? `/sites/${effectiveSiteId}/menus` : undefined;
  const mediaTo = effectiveSiteId ? `/sites/${effectiveSiteId}/media` : undefined;
  const redirectsTo = effectiveSiteId ? `/sites/${effectiveSiteId}/redirects` : undefined;
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
            {hasSites && (
              <button
                type="button"
                className="app-topbar-hamburger"
                aria-haspopup="menu"
                aria-expanded={mobileNavOpen}
                aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setMobileNavOpen((current) => !current)}
              >
                <HamburgerIcon open={mobileNavOpen} />
              </button>
            )}
            <Link className="app-logo" to="/" title="Granite CMS">
              <span className="app-logo-mark">
                <GraniteLogo />
              </span>
              {siteAddressLabel ? (
                <span className="app-logo-word app-logo-url">{siteAddressLabel}</span>
              ) : (
                <span className="app-logo-word">
                  GRANITE<span className="app-logo-version">{APP_VERSION}</span>
                </span>
              )}
            </Link>
            {siteAddressLabel && siteLiveHref && (
              <a
                className="app-logo-external-link"
                href={siteLiveHref}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${siteAddressLabel} in a new tab`}
                aria-label={`Open ${siteAddressLabel} in a new tab`}
              >
                <ExternalLinkIcon />
              </a>
            )}
          </div>
          {/* Always rendered, even with nothing to navigate to yet -
              its own flex: 1 (app-shell.css) is what fills the middle
              span between the logo and the account avatar, keeping the
              avatar pinned to the right edge either way. Only the items
              inside are conditional. */}
          <nav className={`app-topbar-nav${mobileNavOpen ? ' is-open' : ''}`} aria-label="Primary">
            {hasSites && (
              <>
                {/* First item, as the default/primary destination -
                    always present, like Pages/Menus/Media/Redirects.
                    Links to the current location while already there
                    (unchanged), otherwise to whichever site is known
                    (falling back to the last-visited one) and that
                    site's own last-visited editor location, falling
                    back again to its default homepage document.
                    Disabled only on a genuine first-ever visit, before
                    any site has ever been known. */}
                <TopNavItem label="Editor" to={editorNavTo} active={isEditingPage} />
                <TopNavItem label="Pages" to={contentTo} active={location.pathname === contentTo} />
                <TopNavItem label="Menus" to={menusTo} active={location.pathname === menusTo} />
                <TopNavItem label="Media" to={mediaTo} active={location.pathname === mediaTo} />
                <TopNavItem label="Redirects" to={redirectsTo} active={location.pathname === redirectsTo} />
              </>
            )}
          </nav>
          <div className="app-topbar-end">
            <div className="app-topbar-device-toggle">{deviceToggle}</div>
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
        <div className="app-content">
          <PageActionsProvider setActions={setPageActions}>
            <PageDeviceToggleProvider setDeviceToggle={setDeviceToggle}>
              <PagePathProvider setPagePath={setPagePath}>
                <Outlet />
              </PagePathProvider>
            </PageDeviceToggleProvider>
          </PageActionsProvider>
        </div>
      </div>
    </>
  );
}
