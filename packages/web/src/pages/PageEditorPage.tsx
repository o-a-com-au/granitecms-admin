import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useAutosaveDraft } from '../editor/useAutosaveDraft.ts';
import { useDraftPublishActions } from '../editor/useDraftPublishActions.ts';
import { backfillPageName, derivePageLabel } from './derivePageLabel.ts';
import { PreviewFrame } from '../editor/PreviewFrame.tsx';
import { type DeviceTier } from '../editor/DeviceToggle.tsx';
import { canEditAsSections, PageSectionsEditor } from '../sections/PageSectionsEditor.tsx';
import { SectionFieldsPanel } from '../sections/SectionFieldsPanel.tsx';
import { PageMetadataPanel } from '../editor/PageMetadataPanel.tsx';
import { TabPageIcon, TabSectionsIcon } from '../icons/index.tsx';
import { usePageActions, usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { DeviceToggle } from '../editor/DeviceToggle.tsx';

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
  const [viewMode, setViewMode] = useState<'metafields' | 'sections' | 'raw'>('sections');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceTier>('desktop');
  // Phone only (docs/designs/Phone-Preview.png) - desktop always shows
  // the preview alongside both side panels, so this toggle has nothing
  // to do there; see .editor-mobile-preview-toggle's own CSS.
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const highlightedElementRef = useRef<HTMLElement | null>(null);
  // Single source of truth for "which section counts as highlighted
  // right now" - set by either direction (hovering a row here, or
  // hovering the section itself in the preview), so both the preview's
  // own outline effect below and SectionList's row styling can react
  // to the one value instead of each direction maintaining its own.
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);

  function findSectionElement(id: string): HTMLElement | undefined {
    const doc = previewIframeRef.current?.contentDocument;
    return doc
      ? Array.from(doc.querySelectorAll<HTMLElement>('[data-section-id]')).find(
          (element) => element.dataset.sectionId === id,
        )
      : undefined;
  }

  // Reaches directly into the preview iframe's own DOM, safe only
  // because PreviewFrame's src is same-origin (an admin route that
  // proxies the site's real response, never the site directly - see
  // PreviewFrame.tsx's own F1/F3 note). Every section's own theme
  // template already carries data-section-id (confirmed live against
  // the real demo theme, also asserted by the agent repo's own
  // render-page.test.ts), so no renderer change was needed for this.
  // Inline styles, not an injected class/stylesheet - anything added to
  // the iframe's own <head> is wiped out the next time PreviewFrame
  // reloads it (every completed autosave bumps its refresh token).
  // Reacts to highlightedSectionId regardless of which direction set
  // it, so the preview outlines the right section either way.
  useEffect(() => {
    if (highlightedElementRef.current) {
      highlightedElementRef.current.style.outline = '';
      highlightedElementRef.current.style.outlineOffset = '';
      highlightedElementRef.current = null;
    }
    if (highlightedSectionId === null) {
      return;
    }
    const target = findSectionElement(highlightedSectionId);
    if (target) {
      target.style.outline = '2px solid #3b6ef6';
      target.style.outlineOffset = '-2px';
      highlightedElementRef.current = target;
    }
  }, [highlightedSectionId]);

  // Admin-row hover also scrolls the preview to the section - a
  // one-off action, deliberately not folded into the effect above,
  // since the preview->admin direction below must NOT also trigger a
  // scroll (the user is already looking straight at the section they
  // just hovered in the preview; re-centring it under them would be a
  // jarring, unrequested yank, not a helpful nudge).
  function handleHighlightFromAdmin(id: string | null): void {
    setHighlightedSectionId(id);
    if (id === null) {
      return;
    }
    const target = findSectionElement(id);
    // 'center', not 'start' - a section taller than the viewport (the
    // common case) already has its top edge in view the moment any
    // part of it scrolls in, so 'start' would frequently be a no-op;
    // 'center' actually moves the view for those too.
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // The reverse direction: hovering a section in the preview itself
  // highlights its row in the sidebar. mouseover/mouseout (not
  // mouseenter/mouseleave, which don't bubble and so can't be
  // delegated) with a relatedTarget check is the standard pattern for
  // delegated hover-tracking - closest() finds which section (if any)
  // owns the actual hovered element, and the relatedTarget check stops
  // mouseout from firing (and clearing the highlight) when the pointer
  // only moved to a child element still inside the same section.
  // Reattached on every PreviewFrame onLoad, not just once on mount -
  // the iframe fully re-navigates (a plain src reassignment) on every
  // completed autosave, discarding its old document and any listeners
  // on it entirely.
  function handlePreviewFrameLoad(): void {
    const doc = previewIframeRef.current?.contentDocument;
    if (!doc) {
      return;
    }
    // Duck-typed, not `target instanceof Element` - the iframe's
    // document lives in its own separate realm with its own Element
    // constructor, so an instanceof check against this module's own
    // (parent-realm) Element would silently fail for every element
    // actually inside it, same-origin or not (a well-known cross-frame
    // instanceof pitfall, not specific to this app).
    function sectionIdAt(target: EventTarget | null): string | null {
      if (target === null || !('closest' in target)) {
        return null;
      }
      return (target as Element).closest<HTMLElement>('[data-section-id]')?.dataset.sectionId ?? null;
    }
    doc.addEventListener('mouseover', (event) => {
      const id = sectionIdAt(event.target);
      if (id !== null) {
        setHighlightedSectionId(id);
      }
    });
    doc.addEventListener('mouseout', (event) => {
      const id = sectionIdAt(event.target);
      const relatedId = sectionIdAt((event as MouseEvent).relatedTarget);
      if (id !== null && id !== relatedId) {
        setHighlightedSectionId(null);
      }
    });
  }

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

  // Sections is only ever an option when the content is actually a
  // sections-shaped document - a menu, or any content without a
  // sections array, falls back to raw regardless of which tab was
  // last selected. Raw JSON has no button of its own any more (Page
  // Meta/Sections are the two visible tabs) - it's reachable only as
  // this automatic fallback. Page has no such dependency (it isn't
  // wired to real data yet - see PageMetadataPanel's own note).
  const sectionsAvailable = canEditAsSections(content);
  const effectiveViewMode = viewMode === 'sections' && !sectionsAvailable ? 'raw' : viewMode;

  // Replays the fade-in-from-right CSS animation on every Page Meta
  // <-> Sections tab switch - toggling the class via a ref rather than
  // keying the panel on effectiveViewMode, which would remount
  // PageSectionsEditor and lose its scroll state.
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

  // Selecting an instance no longer switches the left column to a
  // "Fields" mode in place - the revised layout (docs/designs/Revised-
  // Page-Edit--Section-Edit.png) shows the Sections list and the
  // fields form side by side, so this just opens the independent
  // right-hand panel (SectionFieldsPanel, mounted below whenever
  // selectedInstanceId is non-null) without touching viewMode at all.
  function handleEditInstance(id: string): void {
    setSelectedInstanceId(id);
  }

  function handleCloseFields(): void {
    setSelectedInstanceId(null);
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

  // Save/Discard render in AppShell's own top bar now (docs/designs/
  // Revised-Page-Edit--Section-Edit.png), via the page-actions slot
  // (PageActionsContext.tsx) - there is no shared header for a footer
  // to sit beneath any more (AppShell.tsx's own refactor moved the nav
  // there too), and .app-topbar-actions itself relocates to a bottom
  // bar below the mobile breakpoint (docs/designs/Phone-Page-Edit--
  // Section-Edit.png) via CSS alone, not a second copy of these
  // buttons. Gated on there actually being something to act on - a
  // draft already exists, or the current editing session has started
  // changing/saving/failed/conflicted - rather than sitting there
  // permanently.
  const contentLoaded = status !== 'loading' && status !== 'not-found' && status !== 'load-error';
  const hasPendingChanges = source === 'draft' || status !== 'ready';
  // Suppressed while the phone-only full-screen preview is open, not
  // just visually - .app-topbar-actions relocates to a fixed bottom
  // bar below the mobile breakpoint (app-shell.css), which would
  // otherwise sit right on top of that preview's own Close Preview
  // button (found live: real overlapping hit-test regions, not just a
  // visual layering nit). docs/designs/Phone-Preview.png itself shows
  // no Save/Discard while previewing either - close the preview first.
  const showActions = contentLoaded && hasPendingChanges && !mobilePreviewOpen;

  usePageActions(
    showActions ? (
      <>
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
      </>
    ) : null,
  );

  // The device-size toggle - lives in AppShell's own top bar now, not
  // PreviewFrame's (docs/designs/Revised-Page-Edit--Section-Edit.png
  // dropped the address-bar-style URL display it used to sit beside
  // entirely, and moved the toggle itself up into the shared header).
  // Shown regardless of pending changes, unlike the actions above -
  // it's a view control, not an editing action, so it stays available
  // even with nothing to save. previewUrl === null (no live preview
  // for this content type) is the one case with genuinely nothing for
  // it to control.
  usePageDeviceToggle(previewUrl !== null ? <DeviceToggle device={device} onChange={setDevice} /> : null);

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
                Page Meta
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
              {effectiveViewMode === 'sections' && (
                <PageSectionsEditor
                  siteId={siteId}
                  content={content}
                  setContent={setContent}
                  validationErrors={validationErrors}
                  onEditInstance={handleEditInstance}
                  onHighlightSection={handleHighlightFromAdmin}
                  highlightedSectionId={highlightedSectionId}
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
        </div>

        {/* A sibling of .editor-preview-full, not nested inside it -
            that panel is itself hidden by default below the mobile
            breakpoint, which would hide a child toggle button along
            with it, leaving no way to ever open it. */}
        <button type="button" className="editor-mobile-preview-toggle" onClick={() => setMobilePreviewOpen(true)}>
          Preview
        </button>

        <div className={`editor-preview-full${mobilePreviewOpen ? ' is-open-mobile' : ''}`}>
          <PreviewFrame
            siteId={siteId}
            url={previewUrl}
            status={status}
            device={device}
            iframeRef={previewIframeRef}
            onFrameLoad={handlePreviewFrameLoad}
            onFrameMouseLeave={() => setHighlightedSectionId(null)}
          />
          {mobilePreviewOpen && (
            <button type="button" className="editor-mobile-preview-close" onClick={() => setMobilePreviewOpen(false)}>
              Close Preview
            </button>
          )}
        </div>

        <div className={`editor-fields-panel${selectedInstanceId !== null ? ' is-open' : ''}`}>
          {selectedInstanceId !== null && (
            <SectionFieldsPanel
              siteId={siteId}
              content={content}
              setContent={setContent}
              validationErrors={validationErrors}
              selectedInstanceId={selectedInstanceId}
              onClose={handleCloseFields}
            />
          )}
        </div>
      </div>
    </div>
  );
}
