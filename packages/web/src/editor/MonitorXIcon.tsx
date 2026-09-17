// The "this cannot be previewed" empty state (PreviewUnavailable.tsx) -
// Lucide's own "monitor-x" (https://lucide.dev, ISC licensed).
//
// Deliberately NOT this app's row-level icon convention (a fixed 16x16
// box at strokeWidth 1.75). That stroke is chosen for a 16px mark and
// reads heavy-handed blown up to panel size - see SiteConnectionPanel's
// own MonitorIcon, which says the same thing and settled on 0.75.
// Matched to it exactly here (requested directly), so the two monitors
// read as the same drawing: 100% width/height so the CSS box sets the
// size, and the same 0.75 stroke.
//
// A screen with a cross rather than a generic warning triangle: the
// thing that failed is specifically the preview, not the revision
// itself - the content is still there and still restorable.
export function MonitorXIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={0.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m14.5 12.5-5-5" />
      <path d="m9.5 12.5 5-5" />
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}
