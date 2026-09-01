// The drag affordance shown on the right of every instance-row that
// supports reordering/reparenting - Lucide's own "grip-vertical"
// (https://lucide.dev, ISC licensed), requested directly at 16x16 with
// a 1.75 stroke. Six r="1" circles rendered with no fill (stroke only,
// matching the rest of Lucide's own icon set) still read as solid
// dots - the stroke's own width already reaches each circle's centre.
export function DragHandleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </svg>
  );
}
