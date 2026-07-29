import { useLocation, useParams, useSearchParams } from 'react-router';
import { BackToRegistryLink } from '../layout/BackToRegistryLink.tsx';

interface EditorLocationState {
  hasDraft?: boolean;
  published?: boolean;
}

// D3: this is deliberately minimal - no fetch, no form. Group E (the
// sidebar editor, not yet built) is what actually reads/edits content
// (its own E1 criterion: "opens a page for editing, reads its current
// content - draft if one exists, else live"). Group D's job is just
// correct navigation here, proven by this page rendering the right
// site/path from the URL alone - nothing load-bearing comes from
// router state, so a hard refresh or a bookmarked link still renders
// sensibly.
export function PlaceholderEditorPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [searchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';
  const location = useLocation();
  const state = location.state as EditorLocationState | null;

  return (
    <main>
      <BackToRegistryLink />
      <h1>Editor</h1>
      <p>
        Site: <code>{siteId}</code>
      </p>
      <p>
        Path: <code>{path}</code>
      </p>
      {state && (
        <p>
          Currently: {state.published ? 'live' : 'not live'}
          {state.hasDraft ? ', with a pending draft' : ''}
        </p>
      )}
      {!state && <p>Open the content list to see its current status.</p>}
      <p>Editing isn&apos;t built yet - coming in Group E.</p>
    </main>
  );
}
