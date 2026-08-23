import { Link } from 'react-router';

export interface SiteStatusAction {
  label: string;
  onClick?: () => void;
  // Rendered as a react-router Link rather than onClick + navigate -
  // Diagnose/Manage Sites are real navigations (should be
  // ctrl/cmd-clickable, show as a link on hover), Retry is the only
  // onClick-only action.
  href?: string;
}

export interface SiteStatusPanelProps {
  message: string;
  // 'loading': pulsing text, no actions. 'problem': static text plus
  // whatever actions the caller has for it (Retry/Diagnose/Manage
  // Sites - never invented here, since only the caller knows what's
  // actually actionable for its own error).
  variant: 'loading' | 'problem';
  actions?: SiteStatusAction[];
}

// The one full-width grey "nothing real to show yet" panel, used by
// every top-level site-scoped screen (Pages/Menus/Media/Redirects/
// Editor/Menu Editor) instead of each rolling its own loading text and
// error handling - see docs/session plan "Wholesale site-loading/
// unreachable UI". Fills whatever full-bleed container it's placed in
// (.list-page or, for PageEditorPage, the whole .editor-shell) rather
// than being a small centred block within one.
export function SiteStatusPanel({ message, variant, actions }: SiteStatusPanelProps) {
  return (
    <div className={`site-status-panel${variant === 'loading' ? ' is-loading' : ''}`} role={variant === 'problem' ? 'alert' : 'status'}>
      <p>{message}</p>
      {actions && actions.length > 0 && (
        <div className="site-status-panel-actions">
          {actions.map((action) =>
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
      )}
    </div>
  );
}
