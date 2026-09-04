import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import type { MediaItem } from '../api/site-media.ts';
import { MediaLibrary } from '../media/MediaLibrary.tsx';
import { MediaImagePreviewModal } from '../media/MediaImagePreviewModal.tsx';
import { usePreview, usePreviewVisible } from '../layout/PreviewContext.tsx';
import { DeviceToggle } from '../editor/DeviceToggle.tsx';
import { useSectionClickToEdit } from '../editor/useSectionClickToEdit.ts';
import { usePageDeviceToggle } from '../layout/PageActionsContext.tsx';

// The old full-width photo-grid route becomes a left panel beside the
// shared preview viewport (AppShell's SharedPreviewRegion), the same
// shape PagesHubPage already established - .media-hub is only ever
// this panel, sized 50% wider than the sidebar width by app-shell.css's
// .app-content:has(.media-hub) override (a photo grid wants more room
// per row than a text list does). The shared viewport itself keeps
// showing whatever site page was last active throughout (this page
// only asks for it to stay visible, same as Pages hub) - selecting a
// media item opens it in its own popup (MediaImagePreviewModal)
// instead, since a media file has nothing to do with the page preview
// and enlarging it there was easy to mistake for that preview reloading.
export function MediaLibraryPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  // MediaLibrary's own search/Upload toolbar (.panel-toolbar) registers
  // itself here instead of rendering inline, so it sits between the
  // heading bar and .editor-tab-content and doesn't scroll away with
  // the grid beneath it - same treatment, same reasoning as
  // PagesHubPage.tsx's own tabUtilities.
  const [utilities, setUtilities] = useState<ReactNode>(null);
  const { device, setDevice } = usePreview();

  usePreviewVisible(true);
  // Same "hover/click a section in the preview to jump into editing
  // it" interaction Pages hub also gets - the shared viewport can still
  // be showing a real page while browsing Media, so this is available
  // "everywhere the viewport shows a page", not just from Pages hub.
  useSectionClickToEdit(siteId);
  // Same device-size toggle Pages hub already wires up - the shared
  // viewport still shows whatever site page was last active while
  // browsing Media, so the topbar shouldn't drop the one control that
  // affects it just because this route itself has nothing to do with a
  // page. Without this, the topbar visibly reflowed (the toggle's own
  // slot going empty) switching to/from Media - reported directly.
  const deviceToggleNode = useMemo(() => <DeviceToggle device={device} onChange={setDevice} />, [device, setDevice]);
  usePageDeviceToggle(deviceToggleNode);

  return (
    <div className="media-hub">
      <div className="media-hub-panel">
        <div className="panel-tab-shell">
          <div className="panel-heading-bar">
            <h2 className="panel-heading">Media</h2>
          </div>
          {utilities}
          <div className="editor-tab-content">
            <div className="editor-tab-panel media-hub-tab">
              <MediaLibrary
                siteId={siteId}
                mode="panel"
                selectedItem={selectedItem}
                onSelectedItemChange={setSelectedItem}
                onUtilitiesChange={setUtilities}
              />
            </div>
          </div>
        </div>
      </div>
      {selectedItem !== null && <MediaImagePreviewModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
