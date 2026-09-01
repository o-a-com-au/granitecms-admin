// A plain six-dot grip glyph - the drag affordance shown on the right
// of every instance-row that supports reordering/reparenting. Fixed
// 20x20, matching every other instance-row icon's own sizing
// convention (EditIcon/TrashIcon/AccordionArrowIcon) - not
// width/height="100%" any more, which has no size of its own to fall
// back on if its wrapping box's own sizing ever regresses (see
// EditIcon.tsx's own comment for exactly that bug, once real). viewBox
// stays 14x20 (the glyph's own natural, non-square aspect) - the
// browser's default preserveAspectRatio scales it to fit the 20x20
// box without distorting it, rather than stretching it to fill a
// square it was never drawn for.
export function DragHandleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 14 20" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="1.5" fill="currentColor" />
      <circle cx="10" cy="4" r="1.5" fill="currentColor" />
      <circle cx="4" cy="10" r="1.5" fill="currentColor" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
      <circle cx="4" cy="16" r="1.5" fill="currentColor" />
      <circle cx="10" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}
