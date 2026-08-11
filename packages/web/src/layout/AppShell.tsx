import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { useTheme } from '../theme/ThemeContext.tsx';
import { IconSprite, MediaIcon, MenusIcon, PagesIcon, RedirectsIcon } from '../icons/index.tsx';

interface SidebarNavItemProps {
  label: string;
  to: string | undefined;
  active: boolean;
  icon: ReactNode;
}

// A nav item with no destination (siteId not yet known, e.g. on the
// registry, or a section like Media/Redirects with no page built yet)
// renders disabled rather than being omitted - the mockups show all
// four sidebar icons consistently present, each with its own label
// underneath now (docs/design/Pages.png), not icon-only.
function SidebarNavItem({ label, to, active, icon }: SidebarNavItemProps) {
  if (!to) {
    return (
      <span className="nav-rail-item" aria-disabled="true" title={`${label} (unavailable)`}>
        <span className="nav-rail-icon">{icon}</span>
        <span className="nav-rail-label">{label}</span>
      </span>
    );
  }
  return (
    <Link className="nav-rail-item" to={to} aria-current={active ? 'page' : undefined} title={label}>
      <span className="nav-rail-icon">{icon}</span>
      <span className="nav-rail-label">{label}</span>
    </Link>
  );
}

// Wraps every authenticated route as one shared layout - a single left
// icon rail, full height, no top app-wide header bar (docs/design/
// Pages.png and friends removed it entirely - the logo now sits at the
// top of the rail itself, and each page owns whatever action bar it
// needs directly in its own layout, e.g. PageEditorPage's own footer
// Save/Discard and PreviewFrame's own top bar, rather than pushing
// content up into a shared slot the way the old header did).
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

  // Dismiss on an outside click - the popover has no backdrop of its
  // own (docs/design/Account Logout.png shows it floating directly
  // over the page content), so this is the only way to close it
  // without picking Logout. Also dismisses on window blur: this rail
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

  const initial = user?.username ? user.username[0]?.toUpperCase() : '?';

  const contentTo = siteId ? `/sites/${siteId}/content` : undefined;
  const menusTo = siteId ? `/sites/${siteId}/menus` : undefined;

  async function handleLogout(): Promise<void> {
    setAccountOpen(false);
    await logout();
  }

  return (
    <>
      <IconSprite />
      <div className="app-shell">
        <nav className="app-sidebar" aria-label="Primary">
          <Link className="app-logo-mark" to="/" title="Granite CMS">
            G
          </Link>
          <div className="nav-rail-items">
            <SidebarNavItem
              label="Pages"
              to={contentTo}
              active={location.pathname === contentTo}
              icon={<PagesIcon />}
            />
            <SidebarNavItem label="Menus" to={menusTo} active={location.pathname === menusTo} icon={<MenusIcon />} />
            <SidebarNavItem label="Media" to={undefined} active={false} icon={<MediaIcon />} />
            <SidebarNavItem label="Redirects" to={undefined} active={false} icon={<RedirectsIcon />} />
          </div>
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
                <button type="button" role="menuitem" className="account-popover-item" onClick={() => void handleLogout()}>
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
        </nav>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </>
  );
}
