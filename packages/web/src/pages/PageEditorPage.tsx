import { useEffect, useRef, useState } from 'react';
import { useBlocker, useLocation, useParams, useSearchParams } from 'react-router';
import { listSiteContent } from '../api/site-content.ts';
import { useAutosaveDraft } from '../editor/useAutosaveDraft.ts';
import { useDraftPublishActions } from '../editor/useDraftPublishActions.ts';
import { backfillPageName, derivePageLabel } from './derivePageLabel.ts';
import { PreviewFrame } from '../editor/PreviewFrame.tsx';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { TopLoadingBar } from '../site-status/TopLoadingBar.tsx';
import { isPlaceholderStatus, buildPlaceholderPanelProps } from '../site-status/placeholder-status.ts';
import { useToast } from '../toast/ToastContext.tsx';
import { type DeviceTier } from '../editor/DeviceToggle.tsx';
import { canEditAsSections, PageSectionsEditor } from '../sections/PageSectionsEditor.tsx';
import { SectionFieldsPanel } from '../sections/SectionFieldsPanel.tsx';
import { PageMetadataPanel } from '../editor/PageMetadataPanel.tsx';
import { ConfirmDialog } from '../editor/ConfirmDialog.tsx';
import { UnsavedChangesPrompt } from '../editor/UnsavedChangesPrompt.tsx';
import { PageHistoryTab } from '../history/PageHistoryTab.tsx';
import { writeLastEditorLocation } from '../sites/currentSite.ts';
import { usePageActions, usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { DeviceToggle } from '../editor/DeviceToggle.tsx';

// Group I: the structured section/block editor (PageSectionsEditor) is
// the default view, driving the exact same useAutosaveDraft hook Group
// E built - the raw textarea below is kept only as a fallback toggle,
// for content the structured editor can't represent (no sections
// array) and for the envelope fields it doesn't give controls to.
export function PageEditorPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const { showToast } = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';
  const previewUrl = searchParams.get('url');
  const [viewMode, setViewMode] = useState<'metafields' | 'sections' | 'raw' | 'history'>('sections');
  // The commit hash currently rendered in the main viewport while
  // browsing the History tab, or null for the normal current-version
  // preview - deliberately independent of status/source (draft/live
  // editing state): entering/leaving History mode must never touch the
  // actual draft being edited, only what PreviewFrame is asked to show.
  const [historyPreviewRef, setHistoryPreviewRef] = useState<string | null>(null);
  useEffect(() => {
    if (viewMode !== 'history') {
      setHistoryPreviewRef(null);
    }
  }, [viewMode]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  // A selected instance belongs to whatever page's content was loaded
  // when it was selected - once path itself changes (any navigation
  // that actually went through, preview link or otherwise), the id no
  // longer refers to anything in the new content, so the Fields panel
  // must close rather than show stale/mismatched data.
  useEffect(() => {
    setSelectedInstanceId(null);
  }, [path]);
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
  // url -> path, so a clicked preview link can be resolved to a
  // content file synchronously (no per-click network round trip).
  // Neither the admin's own proxy nor the site's /v1/content itself
  // offers a single-URL lookup (only a full listing), so the whole
  // site's content is indexed once per siteId rather than added as a
  // new endpoint on either side.
  const [contentIndex, setContentIndex] = useState<Map<string, string> | null>(null);
  // The click listener below is attached inside handlePreviewFrameLoad,
  // which only reruns when the iframe's own load event actually fires
  // (a real reload) - not on every render. Editing content doesn't
  // reload the iframe until autosave completes, so a listener reading
  // previewUrl/contentIndex/status directly from its own closure would
  // see whatever they were at the LAST reload, not live values - wrong
  // in exactly the case that matters most (an edit sitting dirty,
  // mid-debounce, is precisely when nothing has reloaded yet). Refs
  // kept current every render sidestep that; setHighlightedSectionId/
  // handleEditInstance elsewhere in this same listener don't need this
  // treatment since they only ever call stable useState setters, never
  // read a value themselves.
  const previewUrlRef = useRef(previewUrl);
  previewUrlRef.current = previewUrl;
  const contentIndexRef = useRef(contentIndex);
  contentIndexRef.current = contentIndex;

  useEffect(() => {
    let cancelled = false;
    setContentIndex(null);
    listSiteContent(siteId, {})
      .then((entries) => {
        if (cancelled) {
          return;
        }
        const index = new Map<string, string>();
        for (const entry of entries) {
          if (entry.url !== null) {
            index.set(entry.url, entry.path);
          }
        }
        setContentIndex(index);
      })
      .catch(() => {
        // A preview link just won't be recognised as internal
        // navigation until this loads (or a future siteId change
        // retries it) - clicking it falls back to opening in a new
        // tab, same as any other unresolvable link.
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

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
    // A historical revision's sections don't necessarily match the
    // current draft's own instance ids (or exist in it at all) - a
    // hover/click wired up against a page that no longer looks like
    // what's being edited would highlight/open the wrong thing, or
    // nothing at all. Simplest correct behaviour: no section
    // interactivity while browsing history, full stop.
    if (historyPreviewRef !== null) {
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
    // Clicking a section in the preview opens its Fields panel, same
    // as clicking its row in the sidebar - capture phase (true), not
    // bubble, so this fires and can preventDefault before a real link
    // or button inside the section (e.g. cta-banner's own "Get
    // started") acts on the click itself. A real link to another page
    // of this site is the one exception (handlePreviewAnchorClick,
    // below) - everything else clicked inside a section still just
    // opens its Fields panel rather than doing whatever it would
    // normally do.
    doc.addEventListener(
      'click',
      (event) => {
        const mouseEvent = event as MouseEvent;
        const anchor =
          mouseEvent.target !== null && 'closest' in mouseEvent.target
            ? (mouseEvent.target as Element).closest<HTMLAnchorElement>('a[href]')
            : null;
        if (anchor !== null) {
          handlePreviewAnchorClick(mouseEvent, anchor, doc);
          return;
        }
        const id = sectionIdAt(event.target);
        if (id !== null) {
          event.preventDefault();
          setHighlightedSectionId(id);
          handleEditInstance(id);
        }
      },
      true,
    );
  }

  // A link inside the preview always means one of three things, never
  // the iframe's own default navigation - staying inside the admin-
  // proxied preview (F1/F3 above) is what keeps published-vs-draft
  // preview accuracy intact, which a raw navigation to the site's real
  // origin would silently break:
  //  1. Another page this CMS actually manages - confirm first if the
  //     current page has edits the debounce hasn't flushed yet, then
  //     hand the admin itself over to that page (setSearchParams),
  //     same mechanism handleRenamed already uses below.
  //  2. The current page again (a hash link, or a link to itself) -
  //     nothing to do; just stop the iframe navigating to its own real
  //     origin for no reason.
  //  3. Anything else (external, or not a page this CMS tracks) - open
  //     it in a real new tab instead, so it's still reachable without
  //     ever pulling the admin's own preview iframe off the proxy.
  function handlePreviewAnchorClick(event: MouseEvent, anchor: HTMLAnchorElement, doc: Document): void {
    const href = anchor.getAttribute('href');
    if (href === null) {
      return;
    }
    let resolved: URL;
    let siteOrigin: string;
    try {
      resolved = new URL(href, doc.baseURI);
      siteOrigin = new URL(doc.baseURI).origin;
    } catch {
      return;
    }

    if (resolved.origin !== siteOrigin) {
      event.preventDefault();
      window.open(resolved.href, '_blank', 'noopener,noreferrer');
      return;
    }

    if (resolved.pathname === previewUrlRef.current) {
      event.preventDefault();
      return;
    }

    const matchedPath = contentIndexRef.current?.get(resolved.pathname) ?? null;
    if (matchedPath === null) {
      event.preventDefault();
      window.open(resolved.href, '_blank', 'noopener,noreferrer');
      return;
    }

    event.preventDefault();
    navigateToPage(matchedPath, resolved.pathname);
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

  // Selecting an instance no longer switches the left column to a
  // "Fields" mode in place - the revised layout (docs/designs/Revised-
  // Page-Edit--Section-Edit.png) shows the Sections list and the
  // fields form side by side, so this just opens the independent
  // right-hand panel (SectionFieldsPanel, mounted below whenever
  // selectedInstanceId is non-null). It does switch the left column to
  // the Sections tab, though: clicking a section directly in the
  // preview while on Page Meta/History should bring its row into view
  // alongside the Fields panel it just opened, not leave the sidebar
  // showing an unrelated tab. A no-op when called from the Sections
  // list's own row click (the only other caller), since that can only
  // happen while already on this tab.
  function handleEditInstance(id: string): void {
    setSelectedInstanceId(id);
    setViewMode('sections');
  }

  function handleCloseFields(): void {
    setSelectedInstanceId(null);
  }

  // Page Meta/History have nothing to do with a selected section - an
  // open Fields panel left over from Sections would be showing
  // settings for an instance the current tab has no relationship to,
  // so switching to either one closes it. Sections itself never closes
  // it, whether reached via this tab bar or via a preview section
  // click (handleEditInstance).
  function handleNonSectionsTabClick(mode: 'metafields' | 'history'): void {
    setViewMode(mode);
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

  // Following a link inside the preview to another page it manages -
  // same query-param swap as handleRenamed above, since as far as
  // useAutosaveDraft and PreviewFrame are concerned this is no
  // different from any other path/url change. No guard of its own any
  // more - the useBlocker below intercepts every path/url-changing
  // navigation uniformly (this one, top nav clicks, content-list
  // links, browser back/forward), so a single UnsavedChangesPrompt
  // covers all of them instead of this one call site having its own
  // separate window.confirm.
  function navigateToPage(newPath: string, newUrl: string): void {
    const next = new URLSearchParams(searchParams);
    next.set('path', newPath);
    next.set('url', newUrl);
    setSearchParams(next);
  }

  const { actionBusy, actionError, confirmingDiscard, handlePublish, handleDiscard, cancelDiscard } = useDraftPublishActions(
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
  const contentLoaded = !isPlaceholderStatus(status);
  const hasPendingChanges = source === 'draft' || status !== 'ready';

  useEffect(() => {
    if (status === 'save-error' && errorMessage) {
      showToast(errorMessage);
    }
  }, [status, errorMessage, showToast]);

  useEffect(() => {
    if (actionError) {
      showToast(actionError);
    }
  }, [actionError, showToast]);

  // Remembers this as the site's own "last visited editor page"
  // (currentSite.ts) - only once content has actually loaded, so a
  // broken or nonexistent URL never overwrites a previously-good
  // remembered location. Feeds the always-visible Editor nav item and
  // "/"'s own default-landing redirect (AppShell.tsx/HomeRedirect.tsx).
  useEffect(() => {
    if (siteId && contentLoaded) {
      writeLastEditorLocation(siteId, `${location.pathname}${location.search}`);
    }
  }, [siteId, contentLoaded, location.pathname, location.search]);

  // Guards navigation away from this page while a draft is unpublished
  // - top nav clicks, the content browser's own page links, and this
  // page's own preview-link handling above, not just one specific
  // click handler. Only a data router (main.tsx/App.tsx's own
  // migration) makes this hook available at all. Renaming is exempt
  // for free, not by any special-casing here -
  // renameDisabled={hasPendingChanges} below already makes
  // handleRenamed's own path/url change unreachable whenever this
  // blocker would have fired anyway.
  //
  // Does NOT reliably cover the browser's own back/forward buttons
  // (a POP navigation) - confirmed live: the URL correctly fails to
  // change, but the prompt below never renders, leaving a silent dead
  // end rather than a clean block. This is a known, still-open
  // upstream limitation of useBlocker itself (react-router issue
  // #11589), not something wrong with this wiring - accepted as a gap
  // rather than chasing a hand-rolled popstate workaround on top of
  // react-router's own history handling.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      contentLoaded &&
      hasPendingChanges &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );

  async function handlePromptSave(): Promise<void> {
    const ok = await handlePublish();
    if (ok) {
      blocker.proceed?.();
    }
  }

  async function handlePromptDiscard(): Promise<void> {
    const ok = await handleDiscard({ skipConfirm: true });
    if (ok) {
      blocker.proceed?.();
    }
  }

  // Suppressed while the phone-only full-screen preview is open, not
  // just visually - .app-topbar-actions relocates to a fixed bottom
  // bar below the mobile breakpoint (app-shell.css), which would
  // otherwise sit right on top of that preview's own Close Preview
  // button (found live: real overlapping hit-test regions, not just a
  // visual layering nit). docs/designs/Phone-Preview.png itself shows
  // no Save/Discard while previewing either - close the preview first.
  // Also suppressed while browsing a historical revision - the viewport
  // is showing something other than the draft these buttons would act
  // on, and "Back to current version"/leaving the History tab is the
  // only way out while it's up, same reasoning as the mobile-preview
  // case above.
  const showActions = contentLoaded && hasPendingChanges && !mobilePreviewOpen && historyPreviewRef === null;

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

  return (
    <>
      <div className="editor-page">
        <div className="editor-shell">
          {isPlaceholderStatus(status) ? (
            status === 'loading' ? (
              <TopLoadingBar active />
            ) : (
              <SiteStatusPanel {...buildPlaceholderPanelProps(status, { errorMessage, siteId, onRetry: reloadLatest })} />
            )
          ) : (
            <>
              <div className="editor-sidebar">
                <div className="editor-sidebar-top">
                  {invalidJson && <p role="alert">Not valid JSON yet - not saved.</p>}

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
                      onClick={() => handleNonSectionsTabClick('metafields')}
                    >
                      Page Meta
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectiveViewMode === 'sections'}
                      disabled={!sectionsAvailable}
                      onClick={() => setViewMode('sections')}
                    >
                      Sections
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectiveViewMode === 'history'}
                      onClick={() => handleNonSectionsTabClick('history')}
                    >
                      History
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
                        selectedInstanceId={selectedInstanceId}
                      />
                    )}
                    {effectiveViewMode === 'raw' && (
                      <label className="raw-json-label">
                        Content
                        <textarea value={content} onChange={(event) => setContent(event.target.value)} />
                      </label>
                    )}
                    {effectiveViewMode === 'history' && (
                      <PageHistoryTab
                        siteId={siteId}
                        path={path}
                        previewRef={historyPreviewRef}
                        hasDraft={source === 'draft'}
                        onSelectRevision={setHistoryPreviewRef}
                        onRestored={reloadLatest}
                      />
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
                  revisionRef={historyPreviewRef}
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
            </>
          )}
        </div>
      </div>
      {blocker.state === 'blocked' && (
        <UnsavedChangesPrompt
          busy={actionBusy}
          error={actionError}
          onSave={() => void handlePromptSave()}
          onDiscard={() => void handlePromptDiscard()}
          onCancel={() => blocker.reset?.()}
        />
      )}
      {confirmingDiscard && (
        <ConfirmDialog
          message="Discard the draft and return to the live version? This cannot be undone."
          confirmLabel="Discard Changes"
          busy={actionBusy}
          onConfirm={() => void handleDiscard({ skipConfirm: true })}
          onCancel={cancelDiscard}
        />
      )}
    </>
  );
}
