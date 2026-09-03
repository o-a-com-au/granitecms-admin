import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { formatFullName } from '../auth/fullName.ts';
import { useTheme } from '../theme/ThemeContext.tsx';
import { IconSprite } from '../icons/index.tsx';
import { GraniteLogo } from './GraniteLogo.tsx';
import { IconRail } from './IconRail.tsx';
import { PageActionsProvider, PageDeviceToggleProvider } from './PageActionsContext.tsx';
import { PreviewProvider, SharedPreviewRegion, usePreview } from './PreviewContext.tsx';
import { AddressBarSearchModal } from './AddressBarSearchModal.tsx';
import { useSites } from '../sites/useSites.ts';
import { readLastSiteId, resolveEditorHref, writeLastSiteId } from '../sites/currentSite.ts';
import { buildLoadErrorActions, loadErrorMessage, toSiteLoadError } from '../sites/site-load-error.ts';
import { APP_VERSION } from './appVersion.ts';

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
// Split from AppShellContent below purely so that component can call
// usePreview() - a context consumer must be a descendant of its own
// Provider, not the same component that renders it. effectiveSiteId is
// computed here AND independently again in AppShellContent (a plain
// useParams()+readLastSiteId() read, cheap enough to not bother
// threading through as a prop).
export function AppShell() {
  const { siteId } = useParams<{ siteId?: string }>();
  const effectiveSiteId = siteId ?? readLastSiteId();
  return (
    <PreviewProvider siteId={effectiveSiteId ?? ''}>
      <AppShellContent />
    </PreviewProvider>
  );
}

function AppShellContent() {
  const { siteId } = useParams<{ siteId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const addressBarRef = useRef<HTMLDivElement>(null);
  // The real address bar's own measured position/size at the moment
  // it's clicked - AddressBarSearchModal is anchored to this exact
  // rect (position: fixed, inline top/left/width) rather than centred
  // in the viewport, so it reads as the address bar itself turning
  // white and growing, not a separate dialog appearing elsewhere
  // (corrected per feedback, with the same mockup - a first pass just
  // centred it, which drifts from the real bar's own position on any
  // viewport where .app-topbar-start/.app-topbar-end aren't equal
  // widths, since the bar's own true centre is then off-centre from
  // the viewport's). Re-measured fresh on every open, not cached -
  // this element can genuinely move (a shorter/longer siteAddressLabel
  // reflows the topbar's own flex row).
  const [addressBarRect, setAddressBarRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [pageActions, setPageActions] = useState<ReactNode>(null);
  const [deviceToggle, setDeviceToggle] = useState<ReactNode>(null);
  const { sites, error: sitesError, refresh: refreshSites } = useSites();
  // The address bar's own page-path comes from the same persistent
  // previewUrl the shared viewport itself shows (PreviewContext.tsx) -
  // not a separate chrome-slot that only PageEditorPage ever populated
  // and cleared on unmount (the old usePagePath/PagePathProvider). That
  // meant switching to Pages hub or Media reset the address bar back to
  // the bare domain even though the SAME page was still being previewed
  // right below it - confirmed live, reported directly. Reading the
  // same previewUrl SharedPreviewRegion already reads means the address
  // bar and the viewport can never show two different pages.
  const { previewUrl, pagesTreeDepth } = usePreview();
  // One indent level's own width (instance-list-nested's margin-left
  // var(--space-lg), 1.5rem + padding-left 0.75rem, instance-rows.css)
  // - the same unit a nested page's own indentation grows by, so
  // .app-content widens in exact step with however deep PagesHubPage's
  // own tree is expanded (requested directly: "opening three levels
  // deep make the panel two tabs wider"). Read here, not inside
  // PagesHubPage itself - this is the one component that actually
  // renders .app-content, the element app-shell.css's own
  // :has(.pages-hub) rule sizes; a custom property set any deeper in
  // the tree would never reach back up to it.
  const pagesHubExtraWidth = pagesTreeDepth > 0 ? `${pagesTreeDepth * 2.25}rem` : undefined;

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

  // AddressBarSearchModal.tsx is pinned to addressBarRect, a one-off
  // snapshot taken at the moment the address bar was clicked - it never
  // re-measures itself, so without this it drifts out of place the
  // instant the real address bar reflows under it (found live: resizing
  // the window while the search box was open left it floating over
  // empty space instead of the bar). Re-measures the same element the
  // click handlers below do, only while the modal is actually open.
  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    function handleResize(): void {
      if (addressBarRef.current) {
        const rect = addressBarRef.current.getBoundingClientRect();
        setAddressBarRect({ top: rect.top, left: rect.left, width: rect.width });
      }
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [searchOpen]);

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
  const siteAddressLabel = currentSite ? joinDomainAndPath(hostLabelFor(currentSite.url), previewUrl) : null;
  const siteLiveHref = currentSite ? joinDomainAndPath(currentSite.url, previewUrl) : null;

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

  // Derived from the site registry itself (sites, above), not from any
  // one route's own content fetch - this is what lets the shared
  // preview viewport show a graceful "site not found"/"unreachable"/
  // "unauthorized" panel (SharedPreviewRegion's own siteError prop)
  // regardless of which route (Editor/Pages hub/Media) happens to be
  // showing it, rather than each of them needing to duplicate this
  // check to get the same treatment PageEditorPage's own content-fetch
  // errors already had via usePreviewBody.
  const siteError = toSiteLoadError(sites, effectiveSiteId ?? '');

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

  // Extracted so the full-page "can't connect" takeover below can
  // reuse the exact same popover (identity, Switch website, theme
  // toggle, Logout) rather than duplicating it - a plain local
  // variable, not a separate component, since it closes directly over
  // this render's own state/handlers instead of needing a large prop
  // list for all of it.
  const accountMenu = (
    <div className="nav-rail-account" ref={accountRef}>
      {accountOpen && (
        <div className="account-popover" role="menu">
          <div className="account-popover-header">
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
              <p className="account-popover-sites-label">Switch website</p>
              <select
                className="account-popover-site-select"
                aria-label="Switch website"
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
              <p className="account-popover-sites-label">Switch website</p>
              <span className="account-popover-item is-current" aria-current="page">
                {hostLabelFor(sites[0]!.url)}
              </span>
            </div>
          )}
          {sites === null && !sitesError && (
            <span className="account-popover-item account-popover-item-muted" aria-disabled="true">
              Loading websites...
            </span>
          )}
          {sitesError && (
            <span className="account-popover-item account-popover-item-muted" role="alert">
              Couldn&apos;t load websites
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
  );

  // A full-page takeover, not just the shared preview region's own
  // small inline panel - requested directly, with a mockup: the
  // registry already knows this site is broken (not-found/unreachable/
  // unauthorized), so render this BEFORE <Outlet/> ever mounts the
  // routed page underneath, rather than alongside it. That's what
  // actually fixes "individual warning messages appear in the viewport
  // and other panels" - Pages hub/Editor/Media/etc. each run their own
  // independent content fetch that would otherwise ALSO fail and show
  // its own separate SiteStatusPanel; none of that ever fires if the
  // page never mounts in the first place.
  //
  // Gated on the raw route siteId (useParams, truthy only on an actual
  // /sites/:siteId/* route), not usePreview()'s own `visible` - visible
  // is itself set true by the routed page's own usePreviewVisible(true)
  // effect, so gating on it created a genuine infinite loop, found
  // live: this branch hides <Outlet/>, which unmounts that page, whose
  // cleanup schedules visible back to false, which un-hides <Outlet/>,
  // remounting the page, which sets visible true again... (confirmed by
  // watching .site-unavailable-body/.nav-rail flicker in and out every
  // ~150ms in a live check). The route siteId has no such circularity -
  // it comes from the URL alone, regardless of whether the matched
  // element underneath ever actually mounts. Settings and Home keep
  // their own normal behaviour even if some other, unrelated site
  // happens to be broken, since neither route has a siteId param at
  // all. Deliberately scoped to only what the registry itself already
  // knows - a route's own content fetch failing for some other,
  // transient reason on an otherwise-healthy site is a different,
  // rarer case, left to that route's own existing (unchanged) handling.
  if (siteId && siteError) {
    return (
      <>
        <IconSprite />
        <div className="app-shell site-unavailable-shell">
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
            <div className="app-topbar-end">{accountMenu}</div>
          </header>
          <div className="site-unavailable-body">
            <h1>Cannot connect to website</h1>
            <p>{loadErrorMessage(siteError)}</p>
            <div className="site-status-panel-actions">
              {buildLoadErrorActions(siteError, effectiveSiteId ?? '', () => void refreshSites()).map((action) =>
                action.href ? (
                  <Link key={action.label} to={action.href} className="site-status-panel-action">
                    {action.label}
                  </Link>
                ) : (
                  <button key={action.label} type="button" className="site-status-panel-action" onClick={action.onClick}>
                    {action.label}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      </>
    );
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
          {/* The address bar - a display of the current page's address
              (site domain + path, from the same shared previewUrl the
              preview viewport itself shows - see AppShellContent's own
              comment above) plus the device-size toggle. Now also a
              search trigger (requested directly, with a mockup) -
              clicking it opens AddressBarSearchModal in place of the
              plain title-hint it used to just show. Only when siteId
              (the raw route param, not effectiveSiteId's own fallback)
              and currentSite are both real - same scoping siteAddressLabel
              itself already uses, since search needs an actual site to
              query, not just "whichever site was last visited" while on
              an unrelated route. role="button"/tabIndex/onKeyDown - a
              plain onClick div isn't independently focusable/operable
              by keyboard otherwise, the same reasoning every other
              "div styled as a control" in this app already follows
              (PagesTabPanel.tsx's own instance-row-main etc). */}
          <div
            ref={addressBarRef}
            className="app-topbar-address-bar"
            title={siteAddressLabel ?? undefined}
            role={siteId && currentSite ? 'button' : undefined}
            tabIndex={siteId && currentSite ? 0 : undefined}
            onClick={() => {
              if (siteId && currentSite && addressBarRef.current) {
                const rect = addressBarRef.current.getBoundingClientRect();
                setAddressBarRect({ top: rect.top, left: rect.left, width: rect.width });
                setSearchOpen(true);
              }
            }}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && siteId && currentSite && addressBarRef.current) {
                event.preventDefault();
                const rect = addressBarRef.current.getBoundingClientRect();
                setAddressBarRect({ top: rect.top, left: rect.left, width: rect.width });
                setSearchOpen(true);
              }
            }}
          >
            <span className="app-address-bar-icon" aria-hidden="true">
              <GlobeIcon />
            </span>
            <span className="app-address-bar-label">{siteAddressLabel ?? 'No website selected'}</span>
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
            {/* stopPropagation - DeviceToggle.tsx's own buttons have no
                such handling themselves (nothing wrapped them in a
                clickable ancestor before now), so a click on one would
                otherwise also bubble up and open the search modal,
                same reasoning the external-link <a> above already
                needed this for. */}
            <div className="app-topbar-device-toggle" onClick={(event) => event.stopPropagation()}>
              {deviceToggle}
            </div>
          </div>
          {searchOpen && siteId && currentSite && addressBarRect && (
            <AddressBarSearchModal
              siteId={siteId}
              domainLabel={hostLabelFor(currentSite.url)}
              anchorRect={addressBarRect}
              onClose={() => setSearchOpen(false)}
            />
          )}
          <div className="app-topbar-end">
            <div className="app-topbar-actions">{pageActions}</div>
            {accountMenu}
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
          <div className="app-content" style={{ '--pages-hub-extra-width': pagesHubExtraWidth } as CSSProperties}>
            <PageActionsProvider setActions={setPageActions}>
              <PageDeviceToggleProvider setDeviceToggle={setDeviceToggle}>
                <Outlet />
              </PageDeviceToggleProvider>
            </PageActionsProvider>
          </div>
          <SharedPreviewRegion siteId={effectiveSiteId ?? ''} siteError={siteError} onRetrySite={refreshSites} />
        </div>
      </div>
    </>
  );
}
