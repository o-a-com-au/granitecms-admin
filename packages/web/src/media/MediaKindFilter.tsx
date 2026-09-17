import { FilterIcon } from '../sections/FilterIcon.tsx';
import { useAddMenu } from '../sections/useAddMenu.ts';
import { MEDIA_KINDS, MEDIA_KIND_LABELS, type MediaKind } from './mediaKind.ts';

export interface MediaKindFilterProps {
  kind: MediaKind;
  onChange: (kind: MediaKind) => void;
}

// The media library's type filter: a single icon button living inside
// the search field, opening a small menu of Show All / Videos / Images
// (requested directly, with a mockup). Replaced a three-option
// segmented control that sat beside the field and took a third of the
// toolbar's width to say something that is 'Show All' almost all of the
// time.
//
// The badge only appears once a filter is actually narrowing the grid.
// That is the whole reason a menu is acceptable here: a menu hides the
// current state behind a click, so without a visible badge there would
// be nothing to say why half the library had vanished.
//
// useAddMenu is this app's existing popover behaviour (outside-click
// and window-blur dismissal), reused rather than re-hand-rolled. Its
// openUpward is ignored, exactly as InstanceRowActions ignores it -
// this trigger sits at the top of a panel and always has room below.
//
// menuitemradio rather than plain menuitem: this is a single choice
// among three, and aria-checked is what conveys which one is active to
// a screen reader. A plain menuitem would announce three equal options
// with no indication of the current filter.
export function MediaKindFilter({ kind, onChange }: MediaKindFilterProps) {
  const { open, setOpen, ref, toggle } = useAddMenu();

  return (
    <div className="media-filter" ref={ref}>
      {kind !== 'all' && <span className="media-filter-badge">{MEDIA_KIND_LABELS[kind]}</span>}
      <button
        type="button"
        className="media-filter-trigger"
        aria-label="Filter media by type"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <FilterIcon />
      </button>
      {open && (
        <div className="media-filter-menu" role="menu">
          {MEDIA_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={kind === option}
              className="media-filter-menu-item"
              onClick={() => {
                setOpen(false);
                onChange(option);
              }}
            >
              {MEDIA_KIND_LABELS[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
