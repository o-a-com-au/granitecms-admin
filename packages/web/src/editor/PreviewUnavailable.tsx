import { MonitorXIcon } from './MonitorXIcon.tsx';

// The admin proxy answers a revision preview it cannot serve with a
// JSON body ({ error, reason }) and a real status - 400 invalid-ref,
// 404 not-found-at-ref, 422 unrenderable, 502 for anything else. The
// iframe used to load that route directly, so the browser simply
// rendered that JSON as plain text in the preview pane (reported
// directly, with a mockup). PreviewFrame now asks first and shows this
// instead.
//
// The heading is the server's own message rather than anything phrased
// here: site-preview-revision.ts already writes a readable sentence per
// outcome ("This revision cannot be previewed with the current theme"),
// and restating it here would let the two drift.

// The raw reason is a slug meant for code (unrenderable,
// not-found-at-ref). Mapped rather than printed: "Reason:
// not-found-at-ref" reads like a leaked internal, which is most of what
// made the old error ugly in the first place. An unrecognised reason
// falls back to the slug with its hyphens opened up, so a new one added
// on the server side still renders as words rather than disappearing.
export function describePreviewReason(reason: string): string {
  const known: Record<string, string> = {
    unrenderable: 'Unrenderable',
    'not-found-at-ref': 'This page did not exist at that revision',
    'invalid-ref': 'Not a valid revision',
    unreachable: 'The website could not be reached',
    unauthorized: 'The stored access token was rejected',
  };
  const label = known[reason];
  if (label !== undefined) {
    return label;
  }
  const opened = reason.replace(/-/g, ' ');
  return opened.charAt(0).toUpperCase() + opened.slice(1);
}

export interface PreviewUnavailableProps {
  message: string;
  reason: string | null;
}

export function PreviewUnavailable({ message, reason }: PreviewUnavailableProps) {
  return (
    <div className="preview-unavailable" role="status">
      <span className="preview-unavailable-icon" aria-hidden="true">
        <MonitorXIcon />
      </span>
      <p className="preview-unavailable-message">{message}</p>
      {reason !== null && <p className="preview-unavailable-reason">Reason: {describePreviewReason(reason)}</p>}
    </div>
  );
}
