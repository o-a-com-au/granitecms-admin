import { useEffect, useRef, useState, type RefObject } from 'react';
import { PreviewUnavailable } from './PreviewUnavailable.tsx';
import type { EditorStatus } from './useAutosaveDraft.ts';
import type { DeviceTier } from './DeviceToggle.tsx';

interface PreviewFrameProps {
  siteId: string;
  url: string | null;
  status: EditorStatus;
  // A caller-driven "reload now" signal (PreviewContext.tsx's own
  // bumpPreview), independent of status - status's own saving->ready
  // transition only ever comes from the Editor's draft-autosave
  // lifecycle, so anything that mutates content a different way (e.g.
  // MenusTabPanel.tsx's menu-item saves, which never touch a draft at
  // all) has no such transition to piggyback on. Optional/defaults to
  // 0 - a caller with no concept of this (Media, a plain page switch)
  // just never bumps it, so nothing changes for it.
  refreshGeneration?: number;
  device: DeviceTier;
  // Set while browsing the page's History tab: renders a specific past
  // git revision instead of the current draft/live content. null/unset
  // is the normal current-version preview - the two never mix, this
  // fully replaces the src rather than layering on top of it.
  revisionRef?: string | null;
  // Exposed so PageEditorPage can reach into the previewed document's
  // own DOM directly (hover-to-highlight a section) - safe only
  // because the iframe's src is same-origin (see the F1/F3 note
  // below), never a cross-origin document a normal page can't touch.
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  // Fires on every load, including the very first one - PageEditorPage
  // uses it to (re)attach its own hover listeners inside the previewed
  // document, since a fresh document (and everything attached to it)
  // replaces the old one entirely on each reload.
  onFrameLoad?: () => void;
  // A plain mouseleave on the iframe element itself, not something
  // relayed from inside its document - PageEditorPage's own delegated
  // mouseout listener (attached via onFrameLoad, above) only reliably
  // fires when the pointer moves to another element still inside the
  // iframe's document; browsers don't consistently fire mouseout with
  // a usable relatedTarget when the pointer leaves the iframe's
  // bounding box entirely. mouseleave on the element itself, tracked
  // from this side by ordinary browser hit-testing against its layout
  // box, is unaffected by any of that and fires reliably either way.
  onFrameMouseLeave?: () => void;
}

const DEVICE_WIDTHS: Record<DeviceTier, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
};

// A real phone/tablet browser hides its own scrollbar entirely -
// simulating one on a desktop browser's iframe without this shows a
// desktop-style scrollbar down the side of the "device", which no
// actual phone or tablet visitor would ever see. Purely cosmetic to
// this admin's own device-simulation chrome, not a change to the
// site's real rendered output: nothing here touches the site's own
// files, and a real published visitor on a real phone already doesn't
// see this scrollbar anyway - this just makes the simulation match
// that, rather than diverging from it. Safe only because the iframe's
// src is same-origin (see the F1/F3 note below) - reaching into a
// genuinely cross-origin document's own head like this would be
// blocked entirely.
const HIDE_SCROLLBAR_STYLE_ID = 'admin-preview-hide-scrollbar';

function setIframeScrollbarHidden(doc: Document, hidden: boolean): void {
  const existing = doc.getElementById(HIDE_SCROLLBAR_STYLE_ID);
  if (!hidden) {
    existing?.remove();
    return;
  }
  if (existing || !doc.head) {
    return;
  }
  const style = doc.createElement('style');
  style.id = HIDE_SCROLLBAR_STYLE_ID;
  style.textContent = 'html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; }';
  doc.head.appendChild(style);
}

// Same per-segment escaping technique as site-editor.ts's own
// encodePathSegments - a leading slash round-trips correctly since
// split('/') on "/" yields ["", ""].
function encodeUrlSegments(url: string): string {
  return url.split('/').map(encodeURIComponent).join('/');
}

// F2: bumps on a real completed autosave ('saving' -> 'ready'), never
// on the initial load ('loading' -> 'ready') or on entering/leaving a
// conflict - a plain ref-tracked transition, not a hook on
// useAutosaveDraft itself, which stays deliberately UI-agnostic and
// shared with a future Group I form editor. Also bumps on any change
// to refreshGeneration (PreviewContext.tsx's own bumpPreview) - the
// one lever available to a caller with no draft/status lifecycle of
// its own (MenusTabPanel.tsx's menu-item saves) to still ask for a
// reload.
//
// Every bump is a real iframe navigation (a plain src reassignment),
// which resets scroll to the top like any browser navigation would -
// jarring after e.g. adding a block deep in a long page, so the old
// document's scroll position is captured here (its very last moment
// still on screen, right before the reload it's about to trigger) and
// handed back via pendingScrollRef for handleFrameLoad, below, to
// restore once the new document has actually loaded.
function usePreviewRefreshToken(
  status: EditorStatus,
  refreshGeneration: number,
  iframeRef: RefObject<HTMLIFrameElement | null> | undefined,
  pendingScrollRef: RefObject<{ x: number; y: number } | null>,
): number {
  const previousStatusRef = useRef(status);
  const previousGenerationRef = useRef(refreshGeneration);
  const [token, setToken] = useState(0);

  useEffect(() => {
    const completedAutosave = previousStatusRef.current === 'saving' && status === 'ready';
    const externallyBumped = previousGenerationRef.current !== refreshGeneration;
    if (completedAutosave || externallyBumped) {
      const win = iframeRef?.current?.contentWindow;
      if (win) {
        pendingScrollRef.current = { x: win.scrollX, y: win.scrollY };
      }
      setToken((current) => current + 1);
    }
    previousStatusRef.current = status;
    previousGenerationRef.current = refreshGeneration;
  }, [status, refreshGeneration]);

  return token;
}

// F1, F3: the iframe's src is a same-origin admin route
// (GET /api/sites/:id/preview/*), never the site directly - the
// browser must never hold the site's raw token. That route forwards
// the site's real rendered response byte-for-byte, so what's shown
// here is exactly what publish would produce, not an approximation.
//
// F2: refreshing is a plain src reassignment (with a cache-busting
// token), not window.postMessage - the previewed document is static
// server-rendered HTML, not a React app with its own JS that needs to
// talk back to this parent, so there is no cross-frame data to relay,
// only a "reload yourself" signal that changing src already
// accomplishes natively, without touching the admin SPA's own router
// or state.
//
// device is owned by PageEditorPage, not this component - the toggle
// itself now lives in AppShell's own top bar (docs/designs/Revised-
// Page-Edit--Section-Edit.png dropped both the address-bar-style URL
// display and PreviewFrame's own top bar entirely, pushing the device
// toggle up into the shared one via PageDeviceToggleContext), but this
// component still needs the current tier to size its iframe, so it
// stays a plain prop here rather than moving with the toggle.
interface RevisionPreviewError {
  message: string;
  reason: string | null;
}

// Exactly the statuses the admin proxy defines for this route
// (routes/sites.ts): 400 invalid-ref, 404 not-found-at-ref, 422
// unrenderable, 502 for anything else it could not complete. Narrow on
// purpose - anything outside this set means something unexpected
// answered, and replacing a working preview with an error panel over an
// unrecognised response is far worse than leaving the frame alone. That
// is not hypothetical: it regressed two real tests, where a fetch mock
// that simply did not know this route destroyed a perfectly good
// iframe.
const UNPREVIEWABLE_STATUSES = new Set([400, 404, 422, 502]);

function revisionPreviewSrc(siteId: string, revisionRef: string, url: string): string {
  return `/api/sites/${encodeURIComponent(siteId)}/preview-revision/${encodeURIComponent(revisionRef)}${encodeUrlSegments(url)}`;
}

export function PreviewFrame({
  siteId,
  url,
  status,
  refreshGeneration = 0,
  device,
  revisionRef,
  iframeRef,
  onFrameLoad,
  onFrameMouseLeave,
}: PreviewFrameProps) {
  const pendingScrollRef = useRef<{ x: number; y: number } | null>(null);
  const refreshToken = usePreviewRefreshToken(status, refreshGeneration, iframeRef, pendingScrollRef);
  // Tracks "has the CURRENT document actually finished loading" for the
  // onFrameLoad-retrigger effect below - deliberately our own flag, not
  // the iframe's own document.readyState (unreliable to depend on:
  // jsdom's synthetic iframe documents never report 'complete' at all,
  // and a real browser's own readyState transitions aren't something
  // this code should need to reason about beyond "has our own load
  // handler already run for this document").
  const hasLoadedRef = useRef(false);
  // Drives a plain CSS opacity transition (device-preview.css) rather
  // than an animation keyed on mount - the iframe element itself is
  // never remounted (src reassignment is a real browser navigation,
  // not a fresh DOM node), so a mount-triggered animation would only
  // ever have played once, on the very first load, and never again on
  // a later autosave-triggered refresh or page switch.
  const [frameVisible, setFrameVisible] = useState(false);

  // A revision preview can fail in ways the current-version preview
  // cannot: the themes are never revision-pinned, so old-enough content
  // may reference a section, block or layout the theme no longer has
  // (422 unrenderable), the page may not have existed at that revision
  // (404), or the ref itself may be bad (400). The admin proxy answers
  // all of those with a JSON body - and pointing an iframe straight at
  // that route meant the browser rendered the JSON as plain text in the
  // preview pane (reported directly).
  //
  // So ask first, and render a real message instead. Only for a
  // revision: the current-version preview has none of these failure
  // modes and should not pay for a second request.
  const [revisionError, setRevisionError] = useState<RevisionPreviewError | null>(null);

  useEffect(() => {
    if (revisionRef == null || url === null) {
      setRevisionError(null);
      return;
    }
    let cancelled = false;
    setRevisionError(null);
    // An async IIFE with its own try/catch, not a .then chain: fetch may
    // be absent entirely in some environments, which throws
    // synchronously rather than rejecting, and that would take the
    // whole effect (and the preview with it) down.
    void (async () => {
      try {
        const response = await fetch(revisionPreviewSrc(siteId, revisionRef, url));
        if (cancelled || response.ok || !UNPREVIEWABLE_STATUSES.has(response.status)) {
          return;
        }
        const body = (await response.json().catch(() => null)) as { error?: unknown; reason?: unknown } | null;
        if (cancelled) {
          return;
        }
        setRevisionError({
          // The server writes a readable sentence per outcome; only fall
          // back to our own wording if it somehow sent none.
          message: typeof body?.error === 'string' ? body.error : 'This revision cannot be previewed',
          reason: typeof body?.reason === 'string' ? body.reason : null,
        });
      } catch {
        // Deliberately silent: a failed pre-flight is not itself proof
        // the revision is unpreviewable, and the iframe is still a
        // better answer than an error panel guessing on its behalf. If
        // the route really cannot serve it, the frame shows the same
        // thing it always did.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, revisionRef, url]);

  // Restores whatever usePreviewRefreshToken captured, above, right
  // before triggering this reload - only ever set for that one case
  // (an autosave-triggered refresh of the SAME page), never for the
  // very first load or a genuine switch to a different page, so this
  // is a no-op the rest of the time. behavior: 'instant', not the
  // two-argument scrollTo(x, y) form - that shorthand is equivalent to
  // behavior: 'auto', which still defers to the previewed page's own
  // CSS scroll-behavior (the demo theme sets scroll-behavior: smooth
  // site-wide, for its own anchor-link navigation) - found live, a
  // restore that's supposed to be invisible was instead visibly
  // animating back down the page on every autosave. 'instant' is the
  // one value that always jumps immediately regardless of that.
  function handleFrameLoad(): void {
    const pending = pendingScrollRef.current;
    if (pending) {
      iframeRef?.current?.contentWindow?.scrollTo({ left: pending.x, top: pending.y, behavior: 'instant' });
      pendingScrollRef.current = null;
    }
    hasLoadedRef.current = true;
    setFrameVisible(true);
    onFrameLoad?.();
  }

  // onFrameLoad only otherwise runs from the iframe's own native load
  // event (onLoad below) - fine as long as a fresh registration always
  // coincides with a fresh load, which used to be true, but no longer
  // is: switching between Editor/Pages/Media while staying on the same
  // page (now a normal, unblocked path - see PageEditorPage.tsx's own
  // useBlocker narrowing) swaps which route's handlers are registered
  // (PreviewContext.tsx's frameHandlers) without the iframe reloading
  // at all, since it's already showing that exact page. Without this,
  // the new route's own click/drag listeners never actually get
  // attached to the (already-loaded, unchanged) document - confirmed
  // live, reported as "the viewport nav stops working" after switching
  // tools. Re-runs onFrameLoad immediately whenever it changes, but
  // only if the document is already fully loaded - otherwise a load is
  // already in flight and the real onLoad event below will call it
  // once that completes, same as always.
  useEffect(() => {
    if (hasLoadedRef.current) {
      onFrameLoad?.();
    }
    // Only onFrameLoad itself should retrigger this.
  }, [onFrameLoad]);

  // Resets ahead of the src reassignment these three together drive
  // (below) - a real browser navigation inside the iframe, not a fresh
  // element, so nothing else would otherwise clear frameVisible before
  // handleFrameLoad sets it again once the new document is actually
  // ready. hasLoadedRef resets alongside it, for the exact same reason.
  useEffect(() => {
    hasLoadedRef.current = false;
    setFrameVisible(false);
  }, [url, revisionRef, refreshToken]);

  // Re-applies on every fresh load (frameVisible flips true only once
  // the new document is actually ready - a plain reload replaces the
  // document entirely, wiping any style previously injected into the
  // old one) and on every device change on an already-loaded document
  // (switching tiers never reloads the iframe, only resizes it - see
  // DEVICE_WIDTHS below).
  useEffect(() => {
    const doc = iframeRef?.current?.contentDocument;
    if (!doc) {
      return;
    }
    setIframeScrollbarHidden(doc, device !== 'desktop');
  }, [device, frameVisible, iframeRef]);

  // A native listener, not the iframeRef.current.
  //
  // React's synthetic mouseleave (delegated, like all its pointer
  // events) simulates enter/leave from bubbling mouseover/mouseout
  // rather than binding the browser's own non-bubbling mouseleave -
  // for most elements that's an invisible implementation detail, but
  // confirmed live to not fire reliably for this specific transition
  // (pointer leaving the iframe's own document to a different part of
  // the parent page). The plain DOM mouseleave, bound directly to the
  // element itself here, does fire correctly for exactly that case -
  // this sidesteps the synthetic layer entirely rather than fighting
  // it. Depends on url (not just mount) since the iframe itself is
  // only ever rendered - and therefore only ever assigned to
  // iframeRef.current - once url is non-null.
  useEffect(() => {
    const element = iframeRef?.current;
    if (!element || !onFrameMouseLeave) {
      return;
    }
    element.addEventListener('mouseleave', onFrameMouseLeave);
    return () => element.removeEventListener('mouseleave', onFrameMouseLeave);
  }, [iframeRef, onFrameMouseLeave, url]);

  if (url === null) {
    return (
      <div className="preview-empty">
        <p>No live preview available for this content type.</p>
      </div>
    );
  }

  // A historical revision is its own distinct navigation (changing
  // revisionRef alone reassigns src, no separate refresh token needed -
  // status/refreshToken only ever move while browsing the current
  // version, not while previewing history).
  // Nothing to load into the frame - the pane says why instead. Inside
  // .preview-viewport rather than replacing the whole pane, so the
  // message sits on the same stage the page would have.
  if (revisionError !== null) {
    return (
      <div className="preview-pane">
        <div className="preview-viewport" data-device={device}>
          <PreviewUnavailable message={revisionError.message} reason={revisionError.reason} />
        </div>
      </div>
    );
  }

  const src =
    revisionRef != null
      ? revisionPreviewSrc(siteId, revisionRef, url)
      : `/api/sites/${encodeURIComponent(siteId)}/preview${encodeUrlSegments(url)}?t=${refreshToken}`;

  return (
    <div className="preview-pane">
      <div className="preview-viewport" data-device={device}>
        <iframe
          ref={iframeRef}
          title="Live preview"
          src={src}
          className={frameVisible ? 'is-visible' : ''}
          style={{ width: DEVICE_WIDTHS[device] }}
          onLoad={handleFrameLoad}
        />
      </div>
    </div>
  );
}
