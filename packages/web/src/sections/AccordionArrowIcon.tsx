// The expand/collapse affordance on every instance-row that nests
// (Sections/Blocks and, since it was rebuilt as an SVG rather than a
// plain '›'/'⌄' character, the page tree too) - points right at rest,
// rotated by .instance-row-chevron-icon's own is-expanded class
// (instance-rows.css) rather than a second SVG, since it's the same
// glyph either way. Fixed 20x20, matching every other instance-row
// icon's own sizing convention (EditIcon/TrashIcon/DragHandleIcon) -
// not width/height="100%" any more, which has no size of its own to
// fall back on if its wrapping box's own sizing ever regresses (see
// EditIcon.tsx's own comment for exactly that bug, once real).
export function AccordionArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        d="M48.15,35.2l-25.9,25.9c-1.77,1.77-4.64,1.77-6.41,0s-1.77-4.64,0-6.41l22.69-22.69L15.85,9.31c-1.77-1.77-1.77-4.64,0-6.41s4.64-1.77,6.41,0l25.9,25.9c1.77,1.77,1.77,4.64,0,6.41h0Z"
      />
    </svg>
  );
}
