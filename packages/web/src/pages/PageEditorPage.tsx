import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAutosaveDraft, type EditorStatus } from '../editor/useAutosaveDraft.ts';
import { PreviewFrame } from '../editor/PreviewFrame.tsx';
import { BackToRegistryLink } from '../layout/BackToRegistryLink.tsx';
import { discardSiteDraft, publishSiteDraft, unpublishSitePage } from '../api/site-publishing.ts';

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
  const previewUrl = searchParams.get('url');

  const { status, content, setContent, source, errorMessage, invalidJson, comparisonContent, loadComparison, reloadLatest } =
    useAutosaveDraft(siteId, path);

  // Kept beside the hook, not inside it - useAutosaveDraft stays
  // UI-agnostic (Group E/F's own design principle, reused by a future
  // Group I form editor). reloadLatest() is only ever called after a
  // successful publish/discard/unpublish below, so a thrown error
  // never touches the hook's own state (G5).
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handlePublish(): Promise<void> {
    const message = window.prompt('Describe this change for the publish history:');
    if (message === null) {
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      setActionError('A commit message is required to publish.');
      return;
    }

    setActionBusy(true);
    setActionError(null);
    try {
      await publishSiteDraft(siteId, path, trimmed);
      reloadLatest();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDiscard(): Promise<void> {
    if (!window.confirm('Discard the draft and return to the live version? This cannot be undone.')) {
      return;
    }

    setActionBusy(true);
    setActionError(null);
    try {
      await discardSiteDraft(siteId, path);
      reloadLatest();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to discard the draft');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUnpublish(): Promise<void> {
    const message = window.prompt('Describe why this page is going offline:');
    if (message === null) {
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      setActionError('A commit message is required to unpublish.');
      return;
    }

    setActionBusy(true);
    setActionError(null);
    try {
      await unpublishSitePage(siteId, path, trimmed);
      reloadLatest();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to unpublish');
    } finally {
      setActionBusy(false);
    }
  }

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
    <main className="editor-page">
      <div className="editor-shell">
        <div className="editor-sidebar">
          <BackToRegistryLink />
          <h1>Editor</h1>
          <p>
            Site: <code>{siteId}</code> Path: <code>{path}</code> Source: <code>{source}</code>
          </p>

          <p data-status={status}>{statusLabel(status)}</p>
          {invalidJson && <p role="alert">Not valid JSON yet - not saved.</p>}
          {status === 'save-error' && errorMessage && <p role="alert">{errorMessage}</p>}

          <section className="editor-actions">
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={actionBusy || status === 'dirty' || status === 'saving'}
            >
              Publish
            </button>
            <button type="button" onClick={() => void handleDiscard()} disabled={actionBusy || status === 'saving'}>
              Discard draft
            </button>
            <button type="button" onClick={() => void handleUnpublish()} disabled={actionBusy || status === 'saving'}>
              Unpublish
            </button>
            <Link
              to={`/sites/${siteId}/history?path=${encodeURIComponent(path)}${previewUrl ? `&url=${encodeURIComponent(previewUrl)}` : ''}`}
            >
              History
            </Link>
            {actionError && <p role="alert">{actionError}</p>}
          </section>

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
            <textarea value={content} onChange={(event) => setContent(event.target.value)} />
          </label>
        </div>
        <div className="editor-preview-full">
          <PreviewFrame siteId={siteId} url={previewUrl} status={status} />
        </div>
      </div>
    </main>
  );
}
