// The mobile-only nav toggle (docs/designs/Phone-Pages.png) - plain
// currentColor strokes, not the fixed-palette sprite set, so it
// follows the top bar's own text colour rather than a baked-in fill.
// Morphs into a close "X" while the menu is open, rather than a
// separate icon component, since it's really one continuous toggle
// affordance, not two different icons.
export function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {open ? (
        <>
          <line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="4" y1="6.5" x2="20" y2="6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="4" y1="17.5" x2="20" y2="17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
