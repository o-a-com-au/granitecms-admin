// The expand/collapse affordance on every section row that accepts
// blocks (docs/design's accordion-arrow.svg) - points right at rest,
// rotated by .instance-row-chevron-icon's own is-expanded class
// (instance-rows.css) rather than a second SVG, since it's the same
// glyph either way. width/height="100%" with no fixed size of its own,
// same convention as DragHandleIcon - actual size always comes from
// whatever CSS box wraps it.
export function AccordionArrowIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        d="M48.15,35.2l-25.9,25.9c-1.77,1.77-4.64,1.77-6.41,0s-1.77-4.64,0-6.41l22.69-22.69L15.85,9.31c-1.77-1.77-1.77-4.64,0-6.41s4.64-1.77,6.41,0l25.9,25.9c1.77,1.77,1.77,4.64,0,6.41h0Z"
      />
    </svg>
  );
}
