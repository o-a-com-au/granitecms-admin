import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { useTheme } from '../theme/ThemeContext.tsx';
import { IconSprite } from '../icons/index.tsx';
import { HamburgerIcon } from '../icons/HamburgerIcon.tsx';
import { GraniteLogo } from './GraniteLogo.tsx';
import { PageActionsProvider, PageDeviceToggleProvider } from './PageActionsContext.tsx';

// Bumped by hand alongside any release worth surfacing in the brand
// mark (docs/designs/Phone-Pages.png shows the same "GRANITE 2.3"
// treatment already established for the mobile top bar) - not derived
// from package.json, whose own version has stayed at the 0.0.0
// placeholder throughout development and isn't meant for display.
const APP_VERSION = '2.3';

interface TopNavItemProps {
  label: string;
  to: string | undefined;
  active: boolean;
}

// A nav item with no destination (siteId not yet known, e.g. on the
// registry, or a section like Redirects/History with no page built
// yet) renders disabled rather than being omitted - the revised
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
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pageActions, setPageActions] = useState<ReactNode>(null);
  const [deviceToggle, setDeviceToggle] = useState<ReactNode>(null);

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

  const initial = user?.username ? user.username[0]?.toUpperCase() : '?';

  const contentTo = siteId ? `/sites/${siteId}/content` : undefined;
  const menusTo = siteId ? `/sites/${siteId}/menus` : undefined;
  const mediaTo = siteId ? `/sites/${siteId}/media` : undefined;
  const redirectsTo = siteId ? `/sites/${siteId}/redirects` : undefined;
  // No query string - HistoryPage.tsx dispatches to the site-wide view
  // when ?path= is absent, which is what this top-nav destination
  // always means. A page's own History link (PageEditorPage.tsx,
  // MenuEditorPage.tsx) still always includes ?path=, reaching the
  // same route but the page-scoped view instead.
  const historyTo = siteId ? `/sites/${siteId}/history` : undefined;
  const editorTo = siteId ? `/sites/${siteId}/editor` : undefined;
  const isEditingPage = location.pathname === editorTo;

  async function handleLogout(): Promise<void> {
    setAccountOpen(false);
    await logout();
  }

  return (
    <>
      <IconSprite />
      <div className="app-shell">
        <header className="app-topbar">
          <div className="app-topbar-start">
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
            <Link className="app-logo" to="/" title="Granite CMS">
              <span className="app-logo-mark">
                <GraniteLogo />
              </span>
              <span className="app-logo-word">
                GRANITE<span className="app-logo-version">{APP_VERSION}</span>
              </span>
            </Link>
          </div>
          <nav className={`app-topbar-nav${mobileNavOpen ? ' is-open' : ''}`} aria-label="Primary">
            <TopNavItem label="Pages" to={contentTo} active={location.pathname === contentTo} />
            <TopNavItem label="Menus" to={menusTo} active={location.pathname === menusTo} />
            <TopNavItem label="Media" to={mediaTo} active={location.pathname === mediaTo} />
            <TopNavItem label="Redirects" to={redirectsTo} active={location.pathname === redirectsTo} />
            <TopNavItem label="History" to={historyTo} active={location.pathname === historyTo} />
            {/* Only appears while a page is actually open in the editor
                - there's no standalone "Edit" destination to link to
                from anywhere else, so unlike the other items above this
                one is omitted rather than rendered disabled. Links to
                the current location (path + search) rather than a
                fixed target, so it stays a real, clickable link even
                though it's already active. */}
            {isEditingPage && (
              <TopNavItem label="Edit" to={`${location.pathname}${location.search}`} active={true} />
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
                      <p className="account-popover-name">{user?.name ?? user?.username}</p>
                      <p className="account-popover-email">{user?.email}</p>
                    </div>
                  </div>
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
                onClick={() => setAccountOpen((current) => !current)}
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
              <Outlet />
            </PageDeviceToggleProvider>
          </PageActionsProvider>
        </div>
      </div>
    </>
  );
}
