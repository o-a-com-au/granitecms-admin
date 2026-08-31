import { Link } from 'react-router';
import { EditorIcon, MediaIcon, PagesIcon } from '../icons/index.tsx';

export interface IconRailProps {
  editorTo: string | undefined;
  isEditingPage: boolean;
  contentTo: string | undefined;
  isOnContent: boolean;
  mediaTo: string | undefined;
  isOnMedia: boolean;
}

interface IconRailItemProps {
  label: string;
  to: string | undefined;
  active: boolean;
  icon: React.ReactNode;
}

// A nav item with no destination (siteId not yet known, e.g. on a
// genuine first-ever visit) renders disabled rather than being omitted -
// same convention TopNavItem used before this replaced it.
function IconRailItem({ label, to, active, icon }: IconRailItemProps) {
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

// Replaces AppShell's own horizontal top-bar nav (commit 1cdd753) with
// a revived left icon rail - reduced to three destinations rather than
// the original four/five, since Menus and Redirects now live as tabs
// inside Pages (PagesHubPage.tsx) rather than as separate top-level
// destinations. AppShell.tsx still owns computing each href (site
// fallback, active-route logic) - this component only ever renders
// what it's given, matching TopNavItem's old division of labour.
export function IconRail({ editorTo, isEditingPage, contentTo, isOnContent, mediaTo, isOnMedia }: IconRailProps) {
  return (
    <nav className="app-sidebar" aria-label="Primary">
      <IconRailItem label="Pages" to={contentTo} active={isOnContent} icon={<PagesIcon />} />
      <IconRailItem label="Editor" to={editorTo} active={isEditingPage} icon={<EditorIcon />} />
      <IconRailItem label="Media" to={mediaTo} active={isOnMedia} icon={<MediaIcon />} />
    </nav>
  );
}
