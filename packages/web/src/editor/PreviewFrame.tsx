import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EditorStatus } from './useAutosaveDraft.ts';
import { DeviceToggle, type DeviceTier } from './DeviceToggle.tsx';

interface PreviewFrameProps {
  siteId: string;
  siteDomain: string | null;
  url: string | null;
  status: EditorStatus;
  device: DeviceTier;
  onDeviceChange: (tier: DeviceTier) => void;
  // Exposed so PageEditorPage can reach into the previewed document's
  // own DOM directly (hover-to-highlight a section) - safe only
  // because the iframe's src is same-origin (see the F1/F3 note
  // below), never a cross-origin document a normal page can't touch.
  iframeRef?: RefObject<HTMLIFrameElement | null>;
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

// SiteListEntry.url is a registered origin, e.g. "http://host:3891" -
// but new URL() always normalises a bare origin to include a trailing
// slash ("http://host:3891/"), so a naive concatenation with url
// (which always starts with its own leading slash) can end up
// "host:3891//about". Stripping any trailing slash first guarantees
// exactly one, regardless of which form this particular domain was
// stored in.
function joinDomainAndPath(domain: string, path: string): string {
  return domain.replace(/\/$/, '') + path;
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
// device is owned by PageEditorPage, not this component - the same
// tier drives both this iframe's width and the toggle buttons, which
// now live in PreviewFrame's own top bar (docs/design/Sections Tab.png)
// rather than the app's shared header, so it has to be lifted above
// both. That top bar also shows the page's own full address, standing
// in for the design's own address bar - siteDomain comes from
// PageEditorPage's own useSites() lookup (there is no per-site fetch
// route, only the registry list), and is null until that resolves, in
// which case this falls back to the bare relative path rather than
// showing nothing.
export function PreviewFrame({ siteId, siteDomain, url, status, device, onDeviceChange, iframeRef }: PreviewFrameProps) {
  const refreshToken = usePreviewRefreshToken(status);

  if (url === null) {
    return (
      <div className="preview-empty">
        <p>No live preview available for this content type.</p>
      </div>
    );
  }

  const src = `/api/sites/${encodeURIComponent(siteId)}/preview${encodeUrlSegments(url)}?t=${refreshToken}`;
  const displayedAddress = siteDomain !== null ? joinDomainAndPath(siteDomain, url) : url;

  return (
    <div className="preview-pane">
      <div className="preview-topbar">
        <span className="preview-url">{displayedAddress}</span>
        <DeviceToggle device={device} onChange={onDeviceChange} />
      </div>
      <div className="preview-viewport" data-device={device}>
        <iframe ref={iframeRef} title="Live preview" src={src} style={{ width: DEVICE_WIDTHS[device] }} />
      </div>
    </div>
  );
}
