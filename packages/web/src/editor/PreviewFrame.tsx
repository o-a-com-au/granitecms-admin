import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EditorStatus } from './useAutosaveDraft.ts';
import type { DeviceTier } from './DeviceToggle.tsx';

interface PreviewFrameProps {
  siteId: string;
  url: string | null;
  status: EditorStatus;
  device: DeviceTier;
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

// Same per-segment escaping technique as site-editor.ts's own
// encodePathSegments - a leading slash round-trips correctly since
// split('/') on "/" yields ["", ""].
function encodeUrlSegments(url: string): string {
  return url.split('/').map(encodeURIComponent).join('/');
}

// F2: bumps only on a real completed autosave ('saving' -> 'ready'),
// never on the initial load ('loading' -> 'ready') or on entering/
// leaving a conflict - a plain ref-tracked transition, not a hook on
// useAutosaveDraft itself, which stays deliberately UI-agnostic and
// shared with a future Group I form editor.
function usePreviewRefreshToken(status: EditorStatus): number {
  const previousStatusRef = useRef(status);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (previousStatusRef.current === 'saving' && status === 'ready') {
      setToken((current) => current + 1);
    }
    previousStatusRef.current = status;
  }, [status]);

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
export function PreviewFrame({
  siteId,
  url,
  status,
  device,
  iframeRef,
  onFrameLoad,
  onFrameMouseLeave,
}: PreviewFrameProps) {
  const refreshToken = usePreviewRefreshToken(status);

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

  const src = `/api/sites/${encodeURIComponent(siteId)}/preview${encodeUrlSegments(url)}?t=${refreshToken}`;

  return (
    <div className="preview-pane">
      <div className="preview-viewport" data-device={device}>
        <iframe ref={iframeRef} title="Live preview" src={src} style={{ width: DEVICE_WIDTHS[device] }} onLoad={onFrameLoad} />
      </div>
    </div>
  );
}
