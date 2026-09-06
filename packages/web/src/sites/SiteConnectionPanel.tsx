import { useEffect, useState, type ReactNode } from 'react';
import type { SiteStatus } from '../api/sites.ts';
import { CloseIcon } from '../sections/CloseIcon.tsx';

// Purely cosmetic - status (below) is already loaded by useSites(), not
// re-fetched here. A brief "checking" beat before the real icon/
// caption reads as this panel actively confirming the connection right
// when a site becomes active, rather than the result just silently
// already being there (requested directly).
const CHECK_DELAY_MS = 700;

// Single-use icons (only ever rendered here) - same convention
// IconRail.tsx already established for its own single-use icons.
// Lucide's own "monitor"/"check"/"triangle-alert"
// (https://lucide.dev, ISC licensed). width/height 100%, not a fixed
// pixel value - MonitorIcon renders at whatever size this panel's own
// CSS gives it, not a size baked into the icon itself. A thinner
// 1.25 stroke here (not this app's usual row-level-icon 1.75) -
// requested directly, since this one renders much larger than a
// typical inline icon (settings.css's own .website-status-connection-
// icon), where the same stroke would otherwise look heavy-handed.
function MonitorIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function TriangleAlertIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

// One shared "monitor + badge" shape for every SiteStatus.state, not a
// different base icon per state - only the corner badge (icon +
// colour) and caption change. Reuses CloseIcon (sections/CloseIcon.tsx)
// for the two failure states rather than a second, near-identical "x"
// - same Lucide glyph either way.
function badgeFor(status: SiteStatus): { icon: ReactNode; className: string; caption: string } {
  switch (status.state) {
    case 'ok':
      return { icon: <CheckIcon />, className: 'is-ok', caption: 'Strong Connection' };
    case 'unauthorized':
      return { icon: <TriangleAlertIcon />, className: 'is-warning', caption: 'Check Token' };
    case 'unreachable':
      return { icon: <CloseIcon />, className: 'is-danger', caption: 'Unreachable' };
    case 'error':
      return { icon: <CloseIcon />, className: 'is-danger', caption: 'Connection Error' };
  }
}

// The active site's own "how healthy is the live connection" panel
// (ManageSitesPage.tsx) - a friendlier, at-a-glance companion to
// SiteStatusBadge.tsx's own technical label, not a replacement for it
// (that badge's fuller detail still has its place on the per-site
// Manage page). Requested directly, with a mockup.
export function SiteConnectionPanel({ status }: { status: SiteStatus }) {
  // Runs once per mount, not on every status change - ManageSitesPage.tsx
  // remounts this whole component (key={activeSite.id}) each time a
  // different site becomes active, so a fresh checking beat naturally
  // happens exactly then, with no extra prop/token needed to tell this
  // component "something changed" the way a stable key wouldn't.
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setChecking(false), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const badge = badgeFor(status);
  return (
    <div className="website-status-connection">
      {checking ? (
        <>
          <span className="website-status-connection-spinner" aria-hidden="true" />
          <p>Checking connection...</p>
        </>
      ) : (
        <div className="website-status-connection-result">
          <div className="website-status-connection-icon">
            <MonitorIcon />
            <span className={`website-status-connection-badge ${badge.className}`}>{badge.icon}</span>
          </div>
          <p>{badge.caption}</p>
        </div>
      )}
    </div>
  );
}
