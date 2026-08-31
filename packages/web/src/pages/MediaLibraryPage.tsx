import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import type { MediaItem } from '../api/site-media.ts';
import { MediaLibrary } from '../media/MediaLibrary.tsx';
import { usePreviewBody, usePreviewVisible } from '../layout/PreviewContext.tsx';

// The old full-width photo-grid route becomes a left panel beside the
// shared preview viewport (AppShell's SharedPreviewRegion), the same
// shape PagesHubPage already established - .media-hub is only ever
// this panel, sized 50% wider than the sidebar width by app-shell.css's
// .app-content:has(.media-hub) override (a photo grid wants more room
// per row than a text list does). Selecting an item previews it large
// in the shared viewport instead of navigating anywhere - there's
// nowhere else for a media file to go.
export function MediaLibraryPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  usePreviewVisible(true);

  // useMemo, not a bare JSX expression - usePreviewBody's own effect
  // depends on this node by reference, and this component is itself a
  // subscriber of the same shared PreviewContext it writes to
  // (usePreviewVisible/usePreviewBody both read from it internally) - a
  // fresh element every render would re-register on every render, which
  // itself triggers a re-render of every consumer including this
  // component, recreating the element again: a genuine infinite render
  // loop, not just wasted work (see PageEditorPage.tsx's own fieldsPanelNode
  // for the same reasoning, confirmed live there).
  const previewBodyNode = useMemo(
    () =>
      selectedItem !== null ? (
        <div className="media-preview-body">
          <img src={selectedItem.url} alt={selectedItem.name} />
        </div>
      ) : null,
    [selectedItem],
  );
  usePreviewBody(previewBodyNode);

  return (
    <div className="media-hub">
      <div className="media-hub-panel">
        <div className="editor-sidebar-top">
          <h1>Media</h1>
        </div>
        <div className="editor-tab-content">
          <div className="editor-tab-panel">
            <MediaLibrary siteId={siteId} mode="panel" selectedItem={selectedItem} onSelectedItemChange={setSelectedItem} />
          </div>
        </div>
      </div>
    </div>
  );
}
