// A plain six-dot grip glyph - the drag affordance shown on the right
// of every section/block row, matching docs/design/Sections.png.
// width/height="100%" with no fixed pixel size of its own, same
// convention as icons/index.tsx's referenced sprite icons - actual
// size always comes from whatever CSS box wraps it
// (.instance-row-drag-handle-icon), not a baked-in default here.
// viewBox stays 14x20 (the glyph's own natural, non-square aspect) so
// a differently-sized wrapper still scales it uniformly.
export function DragHandleIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 14 20" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="1.5" fill="currentColor" />
      <circle cx="10" cy="4" r="1.5" fill="currentColor" />
      <circle cx="4" cy="10" r="1.5" fill="currentColor" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
      <circle cx="4" cy="16" r="1.5" fill="currentColor" />
      <circle cx="10" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}
