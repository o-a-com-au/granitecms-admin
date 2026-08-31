import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { DeviceToggle } from '../editor/DeviceToggle.tsx';
import { usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { usePreview, usePreviewVisible } from '../layout/PreviewContext.tsx';
import { writeLastEditorLocation } from '../sites/currentSite.ts';
import { PagesTabPanel, type PreviewablePage } from './PagesTabPanel.tsx';
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
// editor's is while content loads). The live preview viewport itself is
// AppShell's shared one (PreviewContext.tsx), not owned here - this
// page only drives it, so switching to/from Editor or Media never
// reloads it. There's no right-hand fields panel here - editing a
// page's own settings stays the Editor's job, this is a
// browse-and-preview surface. Selecting a page in the Pages tab
// previews it in the shared viewport rather than navigating away
// immediately; each row's own name link still goes straight to the
// full Editor, unchanged from before.
export function PagesHubPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [tab, setTab] = useState<HubTab>('pages');
  const { device, setDevice, setPreview } = usePreview();

  // The shared viewport already shows whatever page was last active for
  // this site (PreviewContext.tsx seeds itself from the same
  // readLastEditorLocation record PageEditorPage.tsx writes to) - this
  // page just needs to ask for it to be shown at all.
  usePreviewVisible(true);
  // useMemo, not a bare JSX expression - usePageDeviceToggle's own
  // effect (PageActionsContext.tsx's createChromeSlot) depends on this
  // node by reference. A fresh element every render re-registers on
  // every render, which is exactly what caused PageEditorPage's own
  // infinite render loop under AppShell's real provider nesting (see
  // PageEditorPage.tsx's deviceToggleNode for the full explanation) -
  // this call site had the identical bug, just triggered while Pages
  // hub itself is the mounted route instead of Editor.
  const deviceToggleNode = useMemo(() => <DeviceToggle device={device} onChange={setDevice} />, [device, setDevice]);
  usePageDeviceToggle(deviceToggleNode);

  // The reverse direction: previewing a page here also updates the
  // shared record, so switching Pages -> Editor opens this same page
  // instead of whatever was last actually edited.
  function handlePreview(page: PreviewablePage | null): void {
    if (page === null) {
      setPreview({ url: null });
      return;
    }
    setPreview({ url: page.url });
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
    </div>
  );
}
