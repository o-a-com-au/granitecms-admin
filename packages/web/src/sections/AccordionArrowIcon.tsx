// The expand/collapse affordance on every instance-row that nests
// (Sections/Blocks and the page tree) - Lucide's own "chevron-right"
// (https://lucide.dev, ISC licensed), requested directly at 16x16 with
// a 1.75 stroke. Points right at rest, rotated by
// .instance-row-chevron-icon's own is-expanded class (instance-rows.css)
// rather than a second SVG, since it's the same glyph either way -
// unaffected by this icon's own path/size changing underneath it.
export function AccordionArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
