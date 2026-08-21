import type { EditorStatus } from './useAutosaveDraft.ts';

export type PlaceholderStatus = 'loading' | 'not-found' | 'load-error' | 'unreachable';

// A type guard, not a boolean helper, so callers narrow `status` to
// PlaceholderStatus automatically wherever this returns true - both
// PageEditorPage.tsx and MenuEditorPage.tsx switch their tab content
// and preview panes on the result of this same check.
export function isPlaceholderStatus(status: EditorStatus): status is PlaceholderStatus {
  return status === 'loading' || status === 'not-found' || status === 'load-error' || status === 'unreachable';
}

interface EditorContentPlaceholderProps {
  status: PlaceholderStatus;
}

const MESSAGES: Record<PlaceholderStatus, string> = {
  loading: 'Loading content...',
  'not-found': 'No content found at this path.',
  'load-error': 'Something went wrong loading this content.',
  unreachable: 'Could not reach the site. Check back shortly.',
};

// Fills the space the real panels/preview occupy once content has
// loaded, for every status where there's nothing real to show yet -
// keeps the sidebar/tabs shell visible the whole time (see this
// group's own plan doc), rather than the previous behaviour of
// blanking the entire page out from under them.
export function EditorContentPlaceholder({ status }: EditorContentPlaceholderProps) {
  return (
    <div className={`editor-content-placeholder${status === 'loading' ? ' is-loading' : ''}`}>
      <p>{MESSAGES[status]}</p>
    </div>
  );
}
