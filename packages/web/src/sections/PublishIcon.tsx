// The "Publish" action on a page row (PagesTabPanel.tsx) - Lucide's own
// "globe" (https://lucide.dev, ISC licensed), at 16x16 with a 1.75
// stroke, matching every other row-level icon's own convention
// (TrashIcon.tsx etc).
//
// A globe rather than a tick or an upload arrow: publishing is what
// makes the page reachable on the public web, and it pairs with
// DraftIcon.tsx's own struck-through eye as a visible/hidden pair.
export function PublishIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}
