import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../auth/AuthContext.tsx';
import { APP_VERSION } from '../../layout/appVersion.ts';
import { GraniteLogo } from '../../layout/GraniteLogo.tsx';
import { CloseIcon } from '../../sections/CloseIcon.tsx';
import { readLastSiteId, resolveEditorHref } from '../../sites/currentSite.ts';

// Single-use nav icons (only ever rendered once each, by this file) -
// same convention IconRail.tsx already established for its own
// single-use icons: defined locally rather than given their own file,
// since nothing else consumes them. Lucide's own user/lock/credit-
// card/globe (https://lucide.dev, ISC licensed), 16x16 with a 1.75
// stroke, matching every other row-level icon's own convention.
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

interface SettingsNavItemProps {
  label: string;
  shortLabel: string;
  to: string;
  active: boolean;
  icon: ReactNode;
}

// Manual useLocation()-based active check, not react-router's own
// NavLink - mirrors AppShell.tsx's TopNavItem, the one active-link
// pattern already established in this app.
//
// Renders both the full and short label always, letting a mobile
// media query (settings.css) swap which one is visible - requested
// directly, for the horizontal-tabs mobile layout where the full
// label doesn't fit ("Personal Details" -> "Personal" etc). aria-label
// (always the full label) keeps the link's own accessible name stable
// across both breakpoints - without it, a screen reader would
// announce both spans' text concatenated together whenever CSS hasn't
// actually hidden one of them (found live: this app's own test
// environment never applies imported stylesheets at all, so both were
// simultaneously "visible" there regardless of breakpoint).
function SettingsNavItem({ label, shortLabel, to, active, icon }: SettingsNavItemProps) {
  return (
    <Link className="settings-nav-item" to={to} aria-current={active ? 'page' : undefined} aria-label={label}>
      <span className="settings-nav-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="settings-nav-item-label-full" aria-hidden="true">
        {label}
      </span>
      <span className="settings-nav-item-label-short" aria-hidden="true">
        {shortLabel}
      </span>
    </Link>
  );
}

// docs/design/Settings - *.png - one persistent sidebar (this
// component) with an <Outlet/> content pane that swaps per section,
// replacing the three previously-separate /account, /subscription,
// and /settings pages. "Manage Sites" is the one section still
// gated to developers (App.tsx wraps just that subtree in
// RequireDeveloper) - a client never owns a site to manage.
//
// A standalone full-screen view (App.tsx renders this as a sibling of
// AppShell's own subtree, not a child of it) - no topbar/icon rail/
// shared preview at all, just this file's own minimal header. Forces
// data-theme="dark" on its own root regardless of the app's own
// light/dark toggle (requested directly: "everything is on a dark
// background") - every --colour-* token used below and by the section
// pages under <Outlet/> resolves against whichever [data-theme] is
// closest, so this alone is enough to make the whole subtree dark
// without touching a single one of those other files.
export function SettingsLayout() {
  const { user } = useAuth();
  const location = useLocation();

  // Closing returns to wherever the user was before opening Settings -
  // the same "last site, last editor location" fallback AppShell.tsx
  // already uses elsewhere (its own account switcher), rather than a
  // fixed destination. No remembered site yet (a brand new account) ->
  // Home, which HomeRedirect.tsx already sends into onboarding.
  const lastSiteId = readLastSiteId();
  const closeHref = lastSiteId ? resolveEditorHref(lastSiteId) : '/';

  function isActive(prefix: string): boolean {
    return location.pathname === prefix || location.pathname.startsWith(`${prefix}/`);
  }

  return (
    <div className="settings-shell" data-theme="dark">
      <header className="settings-shell-header">
        <Link className="settings-shell-logo" to={closeHref} title="Granite CMS">
          <span className="settings-shell-logo-mark">
            <GraniteLogo />
          </span>
          <span className="settings-shell-logo-word">
            GRANITE<span className="settings-shell-logo-version">{APP_VERSION}</span>
          </span>
        </Link>
        <Link className="settings-shell-close" to={closeHref} aria-label="Close">
          <CloseIcon />
        </Link>
      </header>
      <div className="settings-shell-body">
        <nav className="settings-sidebar" aria-label="Settings">
          <h1>Settings</h1>
          <SettingsNavItem label="Personal Details" shortLabel="Personal" icon={<UserIcon />} to="/settings/personal" active={isActive('/settings/personal')} />
          <SettingsNavItem label="Password and Security" shortLabel="Security" icon={<LockIcon />} to="/settings/password" active={isActive('/settings/password')} />
          <SettingsNavItem label="Manage Subscription" shortLabel="Subscription" icon={<CreditCardIcon />} to="/settings/subscription" active={isActive('/settings/subscription')} />
          {user?.role === 'developer' && (
            <SettingsNavItem label="Manage Sites" shortLabel="Sites" icon={<GlobeIcon />} to="/settings/sites" active={isActive('/settings/sites')} />
          )}
        </nav>
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
