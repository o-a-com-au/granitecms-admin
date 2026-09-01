// The "Add Section"/"Add Block" affordance - Lucide's own "square-plus"
// (https://lucide.dev, ISC licensed), requested directly at 16x16 with
// a 1.75 stroke, matching every other row-level icon's own convention
// (EditIcon.tsx etc). currentColor, not the fixed-palette sprite set -
// this follows its button's own text colour (blue, darker blue on
// hover), not a baked-in fill.
export function AddIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </svg>
  );
}
