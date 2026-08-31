import { useState } from 'react';
import { useParams } from 'react-router';
import { PreviewFrame } from '../editor/PreviewFrame.tsx';
import { DeviceToggle, type DeviceTier } from '../editor/DeviceToggle.tsx';
import { usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { PagesTabPanel } from './PagesTabPanel.tsx';
import { MenusTabPanel } from './MenusTabPanel.tsx';
import { RedirectsTabPanel } from './RedirectsTabPanel.tsx';

type HubTab = 'pages' | 'menus' | 'redirects';

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceTier>('desktop');

  usePageDeviceToggle(<DeviceToggle device={device} onChange={setDevice} />);

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
            {tab === 'pages' && <PagesTabPanel siteId={siteId} onPreview={setPreviewUrl} />}
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
