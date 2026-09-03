import type { ReactNode } from 'react';
import { useAddMenu } from './useAddMenu.ts';
import { MoreIcon } from './MoreIcon.tsx';

export interface InstanceRowAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
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
export function InstanceRowActions({ actions }: InstanceRowActionsProps) {
  const { open, setOpen, ref, toggle } = useAddMenu();

  if (actions.length <= 2) {
    return (
      <>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={action.variant === 'destructive' ? 'instance-row-remove' : 'instance-row-edit'}
            aria-label={action.label}
            onClick={(event) => {
              event.stopPropagation();
              action.onClick();
            }}
          >
            {action.icon}
          </button>
        ))}
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
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              className="instance-row-more-menu-item"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                action.onClick();
              }}
            >
              <span className="instance-row-more-menu-item-icon" aria-hidden="true">
                {action.icon}
              </span>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
