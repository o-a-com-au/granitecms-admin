// The row-level Edit affordance (Pages/Menus hub rows), matching
// AddIcon/TrashIcon's own fixed 16x16 sizing convention rather than
// filling whatever box its container happens to give it - a 100%/100%
// SVG has no size of its own to fall back on if that container's own
// sizing ever regresses, which is exactly how this icon once ballooned
// to fill an entire row (pages-hub.css's .instance-row-main a briefly
// overriding .instance-row-remove's own width/height).
export function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
