// The "Add Section"/"Add Block" affordance, matching docs/design/
// Add-Section-Button.jpg: a sharp-cornered square with a plus, a
// second square peeking out behind its bottom-right corner. currentColor,
// not the fixed-palette sprite set - this follows its button's own
// text colour (blue, darker blue on hover), not a baked-in fill.
export function AddIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 11v11H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="2" width="17" height="17" stroke="currentColor" strokeWidth="1.6" />
      <line x1="10.5" y1="6" x2="10.5" y2="15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="6" y1="10.5" x2="15" y2="10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
