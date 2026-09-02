// The Fields panel's own close affordance - Lucide's own "x"
// (https://lucide.dev, ISC licensed), requested directly at 16x16 with
// a 1.75 stroke, matching every other row-level icon's own convention
// (EditIcon.tsx etc).
export function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
