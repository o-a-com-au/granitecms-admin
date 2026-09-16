// The "Set as Draft" action on a page row (PagesTabPanel.tsx) - Lucide's
// own "eye-off" (https://lucide.dev, ISC licensed), at 16x16 with a 1.75
// stroke, matching every other row-level icon's own convention
// (TrashIcon.tsx etc).
//
// The counterpart to PublishIcon.tsx's globe: setting a page back to a
// draft hides it from the public site entirely (a request for its URL
// 404s exactly as if the page did not exist), so "hidden" says more
// about what actually happens than a pencil would.
export function DraftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
