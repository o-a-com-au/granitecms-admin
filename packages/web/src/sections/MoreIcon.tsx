// InstanceRowActions.tsx's own "more actions" trigger, shown instead
// of individual icon buttons once a row has more than two - Lucide's
// own "more-horizontal" (https://lucide.dev, ISC licensed), 16x16 with
// a 1.75 stroke, matching every other row-level icon's own convention
// in this app.
export function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}
