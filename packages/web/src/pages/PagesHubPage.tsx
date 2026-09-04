import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { DeviceToggle } from '../editor/DeviceToggle.tsx';
import { usePageDeviceToggle } from '../layout/PageActionsContext.tsx';
import { usePagesTreeDepth, usePreview, usePreviewVisible } from '../layout/PreviewContext.tsx';
import { useSectionClickToEdit } from '../editor/useSectionClickToEdit.ts';
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
// immediately - each row's own Edit button is the one that goes
// straight to the full Editor now (direct request); the row's own
// title just previews instead. Hovering/clicking a section directly in
// that preview (useSectionClickToEdit) is the fast path into actually
// editing one, without needing to open the Editor and find it again.
export function PagesHubPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [tab, setTab] = useState<HubTab>('pages');
  const { device, setDevice, setPreview, previewUrl } = usePreview();
  // How many levels deep the Pages tab's own tree is currently expanded
  // (0 = only root rows visible) - PagesTabPanel reports this itself
  // (onMaxDepthChange) since only it knows its own collapsed state.
  // usePagesTreeDepth pushes the number up into the shared preview
  // context, since it's AppShell.tsx (not this page) that owns
  // .app-content - the element whose own width actually has to grow -
  // see PreviewContext.tsx's own comment on why this can't just be a
  // plain inline style set locally here.
  const [pagesTreeDepth, setPagesTreeDepth] = useState(0);
  usePagesTreeDepth(pagesTreeDepth);
  // Whichever tab is currently mounted registers its own search/add
  // toolbar here (RedirectsTabPanel.tsx's own onUtilitiesChange) rather
  // than rendering it as part of its own content - rendered directly
  // between the heading bar and .editor-tab-content (below) so it
  // doesn't scroll away with the list beneath it (requested directly).
  // The registered node is .panel-toolbar itself, which owns its own
  // padding/background/flex-sizing now (pages-hub.css) - no wrapper div
  // needed here any more. Clears itself automatically on a tab switch:
  // the outgoing tab's own component unmounts, running its
  // registration effect's cleanup. Pages/Menus don't have one of their
  // own yet, so this stays null while either is active.
  const [tabUtilities, setTabUtilities] = useState<ReactNode>(null);

  // The shared viewport already shows whatever page was last active for
  // this site (PreviewContext.tsx seeds itself from the same
  // readLastEditorLocation record PageEditorPage.tsx writes to) - this
  // page just needs to ask for it to be shown at all.
  usePreviewVisible(true);
  useSectionClickToEdit(siteId);
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
        <div className="panel-tab-shell">
          <div className="panel-heading-bar">
            <h2 className="panel-heading">{tab === 'pages' ? 'Pages' : tab === 'menus' ? 'Menus' : 'Redirects'}</h2>
          </div>
          {tabUtilities}
          <div className="editor-tab-content">
            <div className="editor-tab-panel">
              {tab === 'pages' && (
                <PagesTabPanel siteId={siteId} onPreview={handlePreview} onMaxDepthChange={setPagesTreeDepth} activeUrl={previewUrl} />
              )}
              {tab === 'menus' && <MenusTabPanel siteId={siteId} />}
              {tab === 'redirects' && <RedirectsTabPanel siteId={siteId} onUtilitiesChange={setTabUtilities} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
