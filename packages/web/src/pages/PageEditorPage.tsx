import { useParams, useSearchParams } from 'react-router';
import { useAutosaveDraft, type EditorStatus } from '../editor/useAutosaveDraft.ts';
import { BackToRegistryLink } from '../layout/BackToRegistryLink.tsx';

function statusLabel(status: EditorStatus): string {
  switch (status) {
    case 'loading':
      return 'Loading...';
    case 'ready':
      return 'Saved';
    case 'dirty':
      return 'Unsaved changes';
    case 'saving':
      return 'Saving...';
    case 'save-error':
      return 'Save failed';
    case 'conflict':
      return 'Conflict';
    case 'not-found':
      return 'Not found';
    case 'load-error':
      return 'Failed to load';
  }
}

// E2's "editing a field" is deliberately a raw JSON textarea over the
// whole content document, not a schema-driven form - Group I (later)
// is where real section/block editing gets built, on top of the same
// useAutosaveDraft hook this page drives.
export function PageEditorPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [searchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';

  const { status, content, setContent, source, errorMessage, invalidJson, comparisonContent, loadComparison, reloadLatest } =
    useAutosaveDraft(siteId, path);

  if (status === 'loading') {
    return (
      <main>
        <BackToRegistryLink />
        <h1>Editor</h1>
        <p>Loading...</p>
      </main>
    );
  }

  if (status === 'not-found') {
    return (
      <main>
        <BackToRegistryLink />
        <h1>Editor</h1>
        <p role="alert">No content found at this path.</p>
      </main>
    );
  }

  if (status === 'load-error') {
    return (
      <main>
        <BackToRegistryLink />
        <h1>Editor</h1>
        <p role="alert">{errorMessage ?? 'Failed to load content.'}</p>
      </main>
    );
  }

  return (
    <main>
      <BackToRegistryLink />
      <h1>Editor</h1>
      <p>
        Site: <code>{siteId}</code> Path: <code>{path}</code> Source: <code>{source}</code>
      </p>

      <p data-status={status}>{statusLabel(status)}</p>
      {invalidJson && <p role="alert">Not valid JSON yet - not saved.</p>}
      {status === 'save-error' && errorMessage && <p role="alert">{errorMessage}</p>}

      {status === 'conflict' && (
        <section>
          <p role="alert">This page changed since you opened it.</p>
          <button type="button" onClick={reloadLatest}>
            Reload latest version
          </button>
          <button type="button" onClick={loadComparison}>
            View changes
          </button>
          {comparisonContent !== null && (
            <div>
              <h2>Latest on the server</h2>
              <pre>{comparisonContent}</pre>
              <h2>Your unsaved version</h2>
              <pre>{content}</pre>
            </div>
          )}
        </section>
      )}

      <label>
        Content
        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={20} cols={80} />
      </label>
    </main>
  );
}
