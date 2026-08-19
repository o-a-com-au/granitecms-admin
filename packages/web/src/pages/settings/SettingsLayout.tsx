import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../auth/AuthContext.tsx';

interface SettingsNavItemProps {
  label: string;
  to: string;
  active: boolean;
}

// Manual useLocation()-based active check, not react-router's own
// NavLink - mirrors AppShell.tsx's TopNavItem, the one active-link
// pattern already established in this app.
function SettingsNavItem({ label, to, active }: SettingsNavItemProps) {
  return (
    <Link className="settings-nav-item" to={to} aria-current={active ? 'page' : undefined}>
      {label}
    </Link>
  );
}

// docs/design/Settings - *.png - one persistent sidebar (this
// component) with an <Outlet/> content pane that swaps per section,
// replacing the three previously-separate /account, /subscription,
// and /settings pages. "Manage Sites" is the one section still
// gated to developers (App.tsx wraps just that subtree in
// RequireDeveloper) - a client never owns a site to manage.
export function SettingsLayout() {
  const { user } = useAuth();
  const location = useLocation();

  function isActive(prefix: string): boolean {
    return location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);
  }

  return (
    <div className="list-page">
      <div className="list-page-inner settings-page">
        <nav className="settings-sidebar" aria-label="Settings">
          <h1>Settings</h1>
          <SettingsNavItem label="Personal Details" to="/settings/personal" active={isActive('/settings/personal')} />
          <SettingsNavItem label="Password and Security" to="/settings/password" active={isActive('/settings/password')} />
          <SettingsNavItem label="Manage Subscription" to="/settings/subscription" active={isActive('/settings/subscription')} />
          {user?.role === 'developer' && (
            <SettingsNavItem label="Manage Sites" to="/settings/sites" active={isActive('/settings/sites')} />
          )}
        </nav>
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
