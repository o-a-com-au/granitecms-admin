import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAddMenu } from './useAddMenu.ts';
import { MoreIcon } from './MoreIcon.tsx';

export interface InstanceRowAction {
  key: string;
  label: string;
  icon: ReactNode;
  // Optional when `to` is set - a navigating action needs no handler
  // of its own, though it may still have one (e.g. to clear a preview
  // before the route changes).
  onClick?: () => void;
  // Renders this action as a real <Link> rather than a <button>, in
  // both the bare-icon and the menu form. Middle-click and cmd-click
  // only open a new tab on a real anchor, and the Pages tree's own
  // Edit action was previously kept out of this component entirely to
  // preserve exactly that - see instance-rows.css's own
  // button.instance-row-edit comment. Carrying it here instead means
  // an action can move into the kebab menu without silently losing
  // open-in-new-tab.
  to?: string;
  state?: unknown;
  // Picks the icon's own hover-reveal styling (instance-rows.css) -
  // 'destructive' reuses .instance-row-remove, everything else
  // .instance-row-edit. Both look identical (same hit-box, same
  // opacity treatment) - this only exists so a future action that
  // genuinely IS destructive (e.g. "Delete" on a row that isn't a
  // plain edit/delete pair) still reads as one visually, the same way
  // every existing row already does.
  variant?: 'default' | 'destructive';
}

export interface InstanceRowActionsProps {
  actions: InstanceRowAction[];
  // 'auto' (the default) renders one or two actions as bare icons and
  // collapses to a menu only beyond that. 'always' forces the menu
  // whatever the count, for a list where every row must present the
  // same single control - the Pages tree, where a row that happens to
  // offer fewer actions (Home and 404 cannot take a child page) would
  // otherwise sprout bare icons while its neighbours show a kebab.
  collapse?: 'auto' | 'always';
}

// The right-hand action cluster every instance-row now shares
// (requested directly - "clean this up so they are all rendered the
// same way"): up to two actions render as direct icon buttons, exactly
// the edit/delete pair every row already has today. Nothing in this
// app needs a third action yet, but the moment one does, this is what
// stops it from growing a third bare icon (or worse, another row
// hand-rolling its own borrowed-class button the way Redirects/Menus
// items used to) - it collapses to a single "more actions" trigger
// (MoreIcon) that opens a small menu listing all of them instead.
export function InstanceRowActions({ actions, collapse = 'auto' }: InstanceRowActionsProps) {
  const { open, setOpen, ref, toggle } = useAddMenu();

  if (collapse === 'auto' && actions.length <= 2) {
    return (
      <>
        {actions.map((action) => {
          const className = action.variant === 'destructive' ? 'instance-row-remove' : 'instance-row-edit';
          return action.to === undefined ? (
            <button
              key={action.key}
              type="button"
              className={className}
              aria-label={action.label}
              onClick={(event) => {
                event.stopPropagation();
                action.onClick?.();
              }}
            >
              {action.icon}
            </button>
          ) : (
            <Link
              key={action.key}
              to={action.to}
              state={action.state}
              className={className}
              aria-label={action.label}
              onClick={(event) => {
                event.stopPropagation();
                action.onClick?.();
              }}
            >
              {action.icon}
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <div className="instance-row-more-wrap" ref={ref}>
      <button
        type="button"
        className="instance-row-more"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="instance-row-more-menu" role="menu">
          {actions.map((action) =>
            action.to === undefined ? (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                className="instance-row-more-menu-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  action.onClick?.();
                }}
              >
                <span className="instance-row-more-menu-item-icon" aria-hidden="true">
                  {action.icon}
                </span>
                {action.label}
              </button>
            ) : (
              <Link
                key={action.key}
                to={action.to}
                state={action.state}
                role="menuitem"
                className="instance-row-more-menu-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  action.onClick?.();
                }}
              >
                <span className="instance-row-more-menu-item-icon" aria-hidden="true">
                  {action.icon}
                </span>
                {action.label}
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}
