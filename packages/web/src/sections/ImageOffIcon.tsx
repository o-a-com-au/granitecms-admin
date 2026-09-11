// A broken/missing image glyph for ImageField.tsx's own error fallback -
// simple primitive shapes (frame + corner circle + diagonal slash), not
// a precise reproduction of a specific icon set's own path data, but
// reads the same way at a glance.
export function ImageOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
