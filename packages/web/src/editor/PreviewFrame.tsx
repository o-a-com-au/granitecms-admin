import { useEffect, useRef, useState } from 'react';
import type { EditorStatus } from './useAutosaveDraft.ts';

interface PreviewFrameProps {
  siteId: string;
  url: string | null;
  status: EditorStatus;
}

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
export function PreviewFrame({ siteId, url, status }: PreviewFrameProps) {
  const refreshToken = usePreviewRefreshToken(status);

  if (url === null) {
    return (
      <div className="preview-empty">
        <p>No live preview available for this content type.</p>
      </div>
    );
  }

  const src = `/api/sites/${encodeURIComponent(siteId)}/preview${encodeUrlSegments(url)}?t=${refreshToken}`;

  return <iframe title="Live preview" src={src} />;
}
