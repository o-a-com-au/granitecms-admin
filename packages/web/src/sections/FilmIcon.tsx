// Marks a media tile as a video (MediaLibrary.tsx) - Lucide's own
// "film" (https://lucide.dev, ISC licensed).
//
// Row-level convention here (16x16 at strokeWidth 1.75), NOT the 0.75
// stroke MonitorXIcon/SiteConnectionPanel use: that thinner stroke
// exists for icons blown up to a 5.4rem panel box, where 1.75 reads
// heavy-handed. This one sits at roughly its authored size in the
// corner of a thumbnail, so it wants the same weight as every other
// small icon in the app.
export function FilmIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7 3v18" />
      <path d="M3 7.5h4" />
      <path d="M3 12h18" />
      <path d="M3 16.5h4" />
      <path d="M17 3v18" />
      <path d="M17 7.5h4" />
      <path d="M17 16.5h4" />
    </svg>
  );
}
