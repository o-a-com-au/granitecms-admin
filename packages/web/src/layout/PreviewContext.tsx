import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { DeviceTier } from '../editor/DeviceToggle.tsx';
import type { EditorStatus } from '../editor/useAutosaveDraft.ts';
import { PreviewFrame } from '../editor/PreviewFrame.tsx';
import { readLastPreviewUrl } from '../sites/currentSite.ts';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { buildLoadErrorActions, loadErrorMessage, type LoadError } from '../sites/site-load-error.ts';

// The one persistent live-preview viewport, owned by AppShell (the one
// component guaranteed never to remount on in-app navigation) instead
// of by whichever route happens to be showing it - PageEditorPage and
// PagesHubPage used to each mount their own separate PreviewFrame,
// meaning the iframe was destroyed and recreated (a full reload) every
// time you switched between them. This context lets a route drive the
// one shared iframe (what URL/device/history-revision it shows) and,
// for PageEditorPage specifically, reach back into its live DOM
// (iframeRef, frame load/mouseleave handlers) for hover-highlight and
// anchor-click interception - the same things it did when it owned the
// iframe directly.
//
// previewUrl/device persist across route changes deliberately (Media
// has no page of its own to preview, so it just keeps showing whatever
// was last active - the same idea readLastPreviewUrl already serves
// for Editor <-> Pages continuity, just centralised instead of
// re-seeded independently by every route). visible/fieldsPanel/
// mobileOpen/previewOverlay/frameHandlers are the opposite: they only
// make sense while the registering route is actually mounted, so those
// reset to their default the moment it unmounts, mirroring
// PageActionsContext.tsx's own auto-clearing chrome-slot pattern.
export interface PreviewFrameHandlers {
  onFrameLoad?: () => void;
  onFrameMouseLeave?: () => void;
}

interface PreviewConfig {
  url: string | null;
  revisionRef: string | null;
  status: EditorStatus;
}

interface PreviewContextValue {
  previewUrl: string | null;
  revisionRef: string | null;
  status: EditorStatus;
  setPreview: (next: Partial<PreviewConfig>) => void;
  device: DeviceTier;
  setDevice: (device: DeviceTier) => void;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  frameHandlers: PreviewFrameHandlers;
  setFrameHandlers: (handlers: PreviewFrameHandlers) => void;
  visible: boolean;
  setVisible: (visible: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  fieldsPanel: ReactNode;
  setFieldsPanel: (node: ReactNode | null) => void;
  previewOverlay: ReactNode;
  setPreviewOverlay: (node: ReactNode | null) => void;
  previewBody: ReactNode;
  setPreviewBody: (node: ReactNode | null) => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

function usePreviewContextValue(): PreviewContextValue {
  const value = useContext(PreviewContext);
  if (!value) {
    throw new Error('usePreview (and its related hooks) must be used within a PreviewProvider');
  }
  return value;
}

export function usePreview(): PreviewContextValue {
  return usePreviewContextValue();
}

// siteId drives a re-seed from the last page active on THIS site, but
// only on a genuine change (tracked via previousSiteIdRef below) - not
// on every mount. The very first render already seeds correctly via
// the lazy useState initialiser, and effects fire child-before-parent
// on mount (React commits a post-order traversal), so an unconditional
// "reseed whenever siteId is set" effect here would run AFTER whichever
// route just mounted underneath had already pushed its own real url via
// setPreview, silently clobbering it back to storage's stale value -
// found by a test asserting the pushed url actually won. Only firing on
// an actual change (e.g. switching sites via the account popover, where
// AppShell itself doesn't remount but the route below it may not have
// pushed anything yet) avoids that race while still covering the case
// it exists for.
export function PreviewProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => (siteId ? readLastPreviewUrl(siteId) : null));
  const [revisionRef, setRevisionRef] = useState<string | null>(null);
  const [status, setStatus] = useState<EditorStatus>('ready');
  const [device, setDevice] = useState<DeviceTier>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameHandlers, setFrameHandlers] = useState<PreviewFrameHandlers>({});
  const [visible, setVisible] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [fieldsPanel, setFieldsPanel] = useState<ReactNode>(null);
  const [previewOverlay, setPreviewOverlay] = useState<ReactNode>(null);
  const [previewBody, setPreviewBody] = useState<ReactNode>(null);
  const previousSiteIdRef = useRef(siteId);

  useEffect(() => {
    if (siteId && siteId !== previousSiteIdRef.current) {
      setPreviewUrl(readLastPreviewUrl(siteId));
    }
    previousSiteIdRef.current = siteId;
  }, [siteId]);

  const setPreview = useCallback((next: Partial<PreviewConfig>) => {
    if ('url' in next) {
      setPreviewUrl(next.url ?? null);
    }
    if ('revisionRef' in next) {
      setRevisionRef(next.revisionRef ?? null);
    }
    if ('status' in next) {
      setStatus(next.status ?? 'ready');
    }
  }, []);

  const value = useMemo<PreviewContextValue>(
    () => ({
      previewUrl,
      revisionRef,
      status,
      setPreview,
      device,
      setDevice,
      iframeRef,
      frameHandlers,
      setFrameHandlers,
      visible,
      setVisible,
      mobileOpen,
      setMobileOpen,
      fieldsPanel,
      setFieldsPanel,
      previewOverlay,
      setPreviewOverlay,
      previewBody,
      setPreviewBody,
    }),
    [
      previewUrl,
      revisionRef,
      status,
      setPreview,
      device,
      frameHandlers,
      visible,
      mobileOpen,
      fieldsPanel,
      previewOverlay,
      previewBody,
    ],
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

// Registers `visible` for as long as the calling route stays mounted,
// resetting to false on unmount - only Editor/Pages/Media ever call
// this, so the shared viewport naturally hides itself on routes with
// nothing to preview (e.g. Settings) without those routes needing to
// know anything about the viewport at all.
export function usePreviewVisible(visible: boolean): void {
  const { setVisible } = usePreviewContextValue();
  useEffect(() => {
    setVisible(visible);
    return () => setVisible(false);
  }, [setVisible, visible]);
}

// PageEditorPage-only: pushes its <SectionFieldsPanel> up to render as
// a sibling of the shared viewport (so it can keep pushing/shrinking
// the viewport's width via CSS exactly as it does today), clearing
// itself on unmount so leaving the Editor doesn't leave a stale panel
// behind.
export function useFieldsPanel(node: ReactNode | null): void {
  const { setFieldsPanel } = usePreviewContextValue();
  useEffect(() => {
    setFieldsPanel(node);
    return () => setFieldsPanel(null);
  }, [setFieldsPanel, node]);
}

// PageEditorPage-only: mirrors its own mobilePreviewOpen toggle (mobile
// is explicitly out of scope for this restructuring - this just lets
// the existing per-route toggle keep targeting the now-shared viewport
// region instead of a region PageEditorPage owned itself).
export function useMobilePreviewOpen(open: boolean): void {
  const { setMobileOpen } = usePreviewContextValue();
  useEffect(() => {
    setMobileOpen(open);
    return () => setMobileOpen(false);
  }, [setMobileOpen, open]);
}

// PageEditorPage-only: its mobile "Close Preview" button, which used to
// render as a sibling of its own PreviewFrame and now needs to render
// as a sibling of the shared one instead.
export function usePreviewOverlay(node: ReactNode | null): void {
  const { setPreviewOverlay } = usePreviewContextValue();
  useEffect(() => {
    setPreviewOverlay(node);
    return () => setPreviewOverlay(null);
  }, [setPreviewOverlay, node]);
}

// PageEditorPage-only: while its own content is still loading (or
// failed to load), it has a placeholder (TopLoadingBar/SiteStatusPanel)
// to show in place of the standard shared PreviewFrame - unlike
// Pages hub/Media, which always have a real url (or nothing at all,
// which PreviewFrame already renders its own empty state for), Editor's
// placeholder reflects its own fetch status, not what's being
// previewed. null (the default, once content has loaded) lets the
// standard shared PreviewFrame show through again.
export function usePreviewBody(node: ReactNode | null): void {
  const { setPreviewBody } = usePreviewContextValue();
  useEffect(() => {
    setPreviewBody(node);
    return () => setPreviewBody(null);
  }, [setPreviewBody, node]);
}

// PageEditorPage-only: (re)attaches its hover-highlight/anchor-click-
// interception listeners on every frame load, and clears the
// highlighted section on mouseleave - see PreviewFrame.tsx's own props
// doc for why both are needed. Callers should memoise `handlers`
// (useCallback/useMemo) - a fresh object every render would otherwise
// re-register on every PageEditorPage render, not just when the
// underlying callbacks actually change.
export function usePreviewFrameHandlers(handlers: PreviewFrameHandlers | null): void {
  const { setFrameHandlers } = usePreviewContextValue();
  useEffect(() => {
    setFrameHandlers(handlers ?? {});
    return () => setFrameHandlers({});
  }, [setFrameHandlers, handlers]);
}

// The one persistent live-preview viewport itself - rendered by
// AppShell.tsx as a sibling of .app-content rather than inside it, so
// it survives whatever the Outlet swaps in underneath it. Exported from
// here (not kept private to AppShell.tsx) so tests can render the exact
// same component a real route ends up talking to, rather than a
// hand-rolled stand-in that could drift from it. Renders nothing at all
// until a route actually asks for it (usePreviewVisible(true)) -
// Settings and any other non-preview route simply never does, so this
// stays hidden there without needing to know anything about the
// current route itself.
export function SharedPreviewRegion({
  siteId,
  siteError = null,
  onRetrySite,
}: {
  siteId: string;
  // The site registry's own view of this site (AppShell.tsx's
  // toSiteLoadError) - independent of whichever route is currently
  // showing this region, so "the site itself was removed/is
  // unreachable/rejected its token" shows the same graceful panel
  // (below) everywhere, not just where a route happens to run its own
  // content fetch (PageEditorPage's own previewBody, still checked
  // first - a route-specific placeholder is more specific than this
  // generic fallback and always wins when present).
  siteError?: LoadError | null;
  onRetrySite?: () => void;
}) {
  const {
    visible,
    previewUrl,
    device,
    revisionRef,
    status,
    iframeRef,
    frameHandlers,
    fieldsPanel,
    mobileOpen,
    previewOverlay,
    previewBody,
  } = usePreview();

  if (!visible) {
    return null;
  }

  return (
    <div className={`shared-preview-region${mobileOpen ? ' is-open-mobile' : ''}`}>
      <div className={`preview-viewport-wrap${fieldsPanel !== null ? ' has-fields-panel' : ''}`}>
        {previewBody ??
          (siteError ? (
            <SiteStatusPanel
              variant="problem"
              message={loadErrorMessage(siteError)}
              actions={buildLoadErrorActions(siteError, siteId, () => onRetrySite?.())}
            />
          ) : (
            <PreviewFrame
              siteId={siteId}
              url={previewUrl}
              status={status}
              device={device}
              revisionRef={revisionRef}
              iframeRef={iframeRef}
              onFrameLoad={frameHandlers.onFrameLoad}
              onFrameMouseLeave={frameHandlers.onFrameMouseLeave}
            />
          ))}
        {previewOverlay}
      </div>
      {/* Always mounted while the region itself is, same convention as
          the Editor's own .editor-sidebar - only PageEditorPage ever
          fills this (SectionFieldsPanel via useFieldsPanel), so it
          renders empty/collapsed (editor-layout.css's .editor-fields-panel,
          not .is-open) on every other route. */}
      <div className={`editor-fields-panel${fieldsPanel !== null ? ' is-open' : ''}`}>{fieldsPanel}</div>
    </div>
  );
}
