import { useState } from 'react';
import { useParams } from 'react-router';
import { PreviewFrame } from '../editor/PreviewFrame.tsx';
import { DeviceToggle, type DeviceTier } from '../editor/DeviceToggle.tsx';
import { usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { readLastEditorLocation, writeLastEditorLocation } from '../sites/currentSite.ts';
import { PagesTabPanel, type PreviewablePage } from './PagesTabPanel.tsx';
import { MenusTabPanel } from './MenusTabPanel.tsx';
import { RedirectsTabPanel } from './RedirectsTabPanel.tsx';

type HubTab = 'pages' | 'menus' | 'redirects';

// The Editor and this hub share one "current page" - readLastEditorLocation
// is the same record PageEditorPage.tsx already writes to on every load
// (currentSite.ts), keyed by siteId, storing the editor route's own
// pathname+search. Pulled apart here just far enough to read back the
// "url" query param PreviewFrame needs - not a second, competing store.
function extractPreviewUrl(pathAndSearch: string | null): string | null {
  const queryIndex = pathAndSearch?.indexOf('?') ?? -1;
  if (pathAndSearch === null || queryIndex === -1) {
    return null;
  }
  return new URLSearchParams(pathAndSearch.slice(queryIndex)).get('url');
}

// The old top-level Pages/Menus/Redirects destinations (each its own
// full-width .list-page route) become one hub: a narrow tabbed left
// panel - same .editor-tabs/.editor-sidebar-top/.editor-tab-content/
// .editor-tab-panel primitives PageEditorPage's own Page Meta/Sections/
// History strip already uses, just a simple flex sibling here rather
// than that sidebar's off-canvas reveal-on-load animation, which this
// panel has no need for (it's never hidden-then-revealed the way the
// editor's is while content loads) - plus a live preview viewport
// (PreviewFrame, the same component/CSS the editor uses), with no
// right-hand fields panel - editing a page's own settings stays the
// Editor's job, this is a browse-and-preview surface. Selecting a page
// in the Pages tab previews it here rather than navigating away
// immediately; each row's own name link still goes straight to the
// full Editor, unchanged from before.
export function PagesHubPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [tab, setTab] = useState<HubTab>('pages');
  // Seeded from whatever page the Editor was last open on for this
  // site, so switching Editor -> Pages shows the same page instead of
  // resetting to the empty state - the whole point of this being the
  // same shared record, not a fresh one.
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => extractPreviewUrl(readLastEditorLocation(siteId)));
  const [device, setDevice] = useState<DeviceTier>('desktop');

  usePageDeviceToggle(<DeviceToggle device={device} onChange={setDevice} />);

  // The reverse direction: previewing a page here also updates the
  // shared record, so switching Pages -> Editor opens this same page
  // instead of whatever was last actually edited.
  function handlePreview(page: PreviewablePage | null): void {
    if (page === null) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(page.url);
    const params = new URLSearchParams({ path: page.path, url: page.url });
    writeLastEditorLocation(siteId, `/sites/${siteId}/editor?${params.toString()}`);
  }

  return (
    <div className="pages-hub">
      <div className="pages-hub-panel">
        <div className="editor-sidebar-top">
          <div className="editor-tabs" role="tablist" aria-label="Pages hub view">
            <button type="button" role="tab" aria-selected={tab === 'pages'} onClick={() => setTab('pages')}>
              Pages
            </button>
            <button type="button" role="tab" aria-selected={tab === 'menus'} onClick={() => setTab('menus')}>
              Menus
            </button>
            <button type="button" role="tab" aria-selected={tab === 'redirects'} onClick={() => setTab('redirects')}>
              Redirects
            </button>
          </div>
        </div>
        <div className="editor-tab-content">
          <div className="editor-tab-panel">
            {tab === 'pages' && <PagesTabPanel siteId={siteId} onPreview={handlePreview} />}
            {tab === 'menus' && <MenusTabPanel siteId={siteId} />}
            {tab === 'redirects' && <RedirectsTabPanel siteId={siteId} />}
          </div>
        </div>
      </div>
      <div className="pages-hub-preview">
        {previewUrl === null ? (
          <div className="pages-hub-preview-empty">
            <p>Select a page to preview it here.</p>
          </div>
        ) : (
          <div className="preview-viewport" data-device={device}>
            <PreviewFrame siteId={siteId} url={previewUrl} status="ready" device={device} />
          </div>
        )}
      </div>
    </div>
  );
}
