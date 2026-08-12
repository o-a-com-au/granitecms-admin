import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useAutosaveDraft } from '../editor/useAutosaveDraft.ts';
import { useDraftPublishActions } from '../editor/useDraftPublishActions.ts';
import { backfillPageName, derivePageLabel } from './derivePageLabel.ts';
import { PreviewFrame } from '../editor/PreviewFrame.tsx';
import { type DeviceTier } from '../editor/DeviceToggle.tsx';
import { canEditAsSections, PageSectionsEditor } from '../sections/PageSectionsEditor.tsx';
import { PageMetadataPanel } from '../editor/PageMetadataPanel.tsx';
import { TabFieldsIcon, TabPageIcon, TabSectionsIcon } from '../icons/index.tsx';
import { useSites } from '../sites/useSites.ts';

// Group I: the structured section/block editor (PageSectionsEditor) is
// the default view, driving the exact same useAutosaveDraft hook Group
// E built - the raw textarea below is kept only as a fallback toggle,
// for content the structured editor can't represent (no sections
// array) and for the envelope fields it doesn't give controls to.
export function PageEditorPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';
  const previewUrl = searchParams.get('url');
  const [viewMode, setViewMode] = useState<'metafields' | 'sections' | 'fields' | 'raw'>('sections');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceTier>('desktop');

  // The registry list, not a dedicated single-site fetch - there is no
  // GET /api/sites/:id, and the list is already cheap/available, so
  // reusing it here avoids adding a new server route just to read one
  // field. null (not yet loaded, or this siteId isn't in the list)
  // just means PreviewFrame shows the relative path on its own,
  // exactly as it already did before this domain existed.
  const { sites } = useSites();
  const siteDomain = sites?.find((site) => site.id === siteId)?.url ?? null;

  const {
    status,
    content,
    setContent: setContentRaw,
    source,
    errorMessage,
    validationErrors,
    invalidJson,
    comparisonContent,
    loadComparison,
    reloadLatest,
  } = useAutosaveDraft(siteId, path);

  // Backfills a missing "name" before every edit reaches the hook, not
  // just once on load - viewing an untouched page must never silently
  // create a draft, but the moment the user actually changes anything,
  // the save that follows must not fail purely because older content
  // never had this field. Posts are excluded (post.schema.json has no
  // "name" property at all and rejects it as an unknown one) - matches
  // the agent's own path-prefix dispatch (validateContent) rather than
  // trusting the content's own unconstrained "type" string.
  function setContent(value: string): void {
    setContentRaw(path.startsWith('posts/') ? value : backfillPageName(value));
  }

  // Sections/Fields are only ever an option when the content is
  // actually a sections-shaped document - a menu, or any content
  // without a sections array, falls back to raw regardless of which
  // tab was last selected. Raw JSON has no button of its own any more
  // (Page/Sections/Fields are the three visible tabs) - it's reachable
  // only as this automatic fallback. Page has no such dependency (it
  // isn't wired to real data yet - see PageMetadataPanel's own note).
  const sectionsAvailable = canEditAsSections(content);
  const effectiveViewMode =
    (viewMode === 'sections' || viewMode === 'fields') && !sectionsAvailable ? 'raw' : viewMode;

  // Replays the fade-in-from-right CSS animation on every tab switch,
  // including Sections <-> Fields (which share one PageSectionsEditor
  // instance and so never remount) - toggling the class via a ref
  // instead of keying the panel on effectiveViewMode, which would
  // remount PageSectionsEditor and lose its scroll/selection state.
  const tabPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = tabPanelRef.current;
    if (!node) {
      return;
    }
    node.classList.remove('tab-fade-in');
    void node.offsetWidth;
    node.classList.add('tab-fade-in');
  }, [effectiveViewMode]);

  const historyHref = `/sites/${siteId}/history?path=${encodeURIComponent(path)}${previewUrl ? `&url=${encodeURIComponent(previewUrl)}` : ''}`;

  function handleEditInstance(id: string): void {
    setSelectedInstanceId(id);
    setViewMode('fields');
  }

  // After a successful slug rename the old path/url no longer exist -
  // this updates the query params in place (not a navigate to a new
  // route, just this same route with new params) so useAutosaveDraft
  // below re-fetches from the page's new real location instead of
  // continuing to read/write the now-gone old one.
  function handleRenamed(newPath: string, newUrl: string): void {
    const next = new URLSearchParams(searchParams);
    next.set('path', newPath);
    next.set('url', newUrl);
    setSearchParams(next);
  }

  const { actionBusy, actionError, handlePublish, handleDiscard } = useDraftPublishActions(
    siteId,
    path,
    derivePageLabel(content, path),
    reloadLatest,
  );

  // Save/Discard render in this page's own footer now (docs/design/
  // Sections Tab.png), not the app's shared header - there is no
  // shared header any more (AppShell.tsx's own refactor). Gated on
  // there actually being something to act on - a draft already
  // exists, or the current editing session has started changing/
  // saving/failed/conflicted - rather than sitting there permanently.
  const contentLoaded = status !== 'loading' && status !== 'not-found' && status !== 'load-error';
  const hasPendingChanges = source === 'draft' || status !== 'ready';
  const showFooter = contentLoaded && hasPendingChanges;

  if (status === 'loading') {
    return (
      <div>
        <h1>Editor</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div>
        <h1>Editor</h1>
        <p role="alert">No content found at this path.</p>
      </div>
    );
  }

  if (status === 'load-error') {
    return (
      <div>
        <h1>Editor</h1>
        <p role="alert">{errorMessage ?? 'Failed to load content.'}</p>
      </div>
    );
  }

  return (
    <div className="editor-page">
      <div className="editor-shell">
        <div className="editor-preview-full">
          <PreviewFrame
            siteId={siteId}
            siteDomain={siteDomain}
            url={previewUrl}
            status={status}
            device={device}
            onDeviceChange={setDevice}
          />
        </div>
        <div className="editor-sidebar">
          <div className="editor-sidebar-top">
            {invalidJson && <p role="alert">Not valid JSON yet - not saved.</p>}
            {status === 'save-error' && errorMessage && <p role="alert">{errorMessage}</p>}
            {actionError && <p role="alert">{actionError}</p>}

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

            <div className="editor-tabs" role="tablist" aria-label="Editor view">
              <button
                type="button"
                role="tab"
                aria-selected={effectiveViewMode === 'metafields'}
                onClick={() => setViewMode('metafields')}
              >
                <span className="tab-icon">
                  <TabPageIcon />
                </span>
                Page
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={effectiveViewMode === 'sections'}
                disabled={!sectionsAvailable}
                onClick={() => setViewMode('sections')}
              >
                <span className="tab-icon">
                  <TabSectionsIcon />
                </span>
                Sections
              </button>
              {selectedInstanceId !== null && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveViewMode === 'fields'}
                  onClick={() => setViewMode('fields')}
                >
                  <span className="tab-icon">
                    <TabFieldsIcon />
                  </span>
                  Fields
                </button>
              )}
            </div>
          </div>

          <div className="editor-tab-content">
            <div className="editor-tab-panel" ref={tabPanelRef}>
              {effectiveViewMode === 'metafields' && (
                <PageMetadataPanel
                  key={path}
                  content={content}
                  setContent={setContent}
                  historyHref={historyHref}
                  siteId={siteId}
                  path={path}
                  previewUrl={previewUrl}
                  renameDisabled={hasPendingChanges}
                  onRenamed={handleRenamed}
                />
              )}
              {(effectiveViewMode === 'sections' || effectiveViewMode === 'fields') && (
                <PageSectionsEditor
                  siteId={siteId}
                  content={content}
                  setContent={setContent}
                  validationErrors={validationErrors}
                  view={effectiveViewMode === 'fields' ? 'fields' : 'list'}
                  onEditInstance={handleEditInstance}
                />
              )}
              {effectiveViewMode === 'raw' && (
                <label className="raw-json-label">
                  Content
                  <textarea value={content} onChange={(event) => setContent(event.target.value)} />
                </label>
              )}
            </div>
          </div>

          {showFooter && (
            <div className="editor-footer">
              <button type="button" onClick={() => void handleDiscard()} disabled={actionBusy || status === 'saving'}>
                Discard Changes
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => void handlePublish()}
                disabled={
                  actionBusy || status === 'dirty' || status === 'saving' || status === 'save-error' || status === 'conflict'
                }
              >
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
