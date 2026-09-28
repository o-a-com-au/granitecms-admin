import { Link } from 'react-router';

// The main side menu's own icon set (requested directly - Lucide's
// "file"/"square-pen"/"image", https://lucide.dev, ISC licensed) -
// deliberately not icons/index.tsx's own fixed-palette sprite system
// (that one can't shift colour via currentColor at all, per its own
// header comment, which is exactly why EditorIcon there was a
// placeholder reusing an unrelated page glyph rather than real
// artwork). Fixed 20x20 with a 1.75 stroke, matching neither system
// elsewhere in this app exactly - a size/weight requested specifically
// for these three. Single-use (only IconRail renders them), so they
// live here rather than as their own files under sections/, unlike
// EditIcon.tsx/TrashIcon.tsx/etc, which are each shared by more than
// one consumer.
function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    </svg>
  );
}

function SquarePenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

// Lucide's "settings" (the same source and 1.75 stroke as the three
// above), for the site's own settings - not the account menu's Account
// Settings, which covers the person and their websites.
function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export interface IconRailProps {
  editorTo: string | undefined;
  isEditingPage: boolean;
  contentTo: string | undefined;
  isOnContent: boolean;
  mediaTo: string | undefined;
  isOnMedia: boolean;
  settingsTo: string | undefined;
  isOnSettings: boolean;
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
export function IconRail({ editorTo, isEditingPage, contentTo, isOnContent, mediaTo, isOnMedia, settingsTo, isOnSettings }: IconRailProps) {
  return (
    <nav className="app-sidebar" aria-label="Primary">
      <IconRailItem label="Pages" to={contentTo} active={isOnContent} icon={<FileIcon />} />
      <IconRailItem label="Editor" to={editorTo} active={isEditingPage} icon={<SquarePenIcon />} />
      <IconRailItem label="Media" to={mediaTo} active={isOnMedia} icon={<ImageIcon />} />
      <IconRailItem label="Settings" to={settingsTo} active={isOnSettings} icon={<SettingsIcon />} />
    </nav>
  );
}
