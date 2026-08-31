import { useState } from 'react';
import { useParams } from 'react-router';
import type { MediaItem } from '../api/site-media.ts';
import { MediaLibrary } from '../media/MediaLibrary.tsx';
import { MediaImagePreviewModal } from '../media/MediaImagePreviewModal.tsx';
import { usePreviewVisible } from '../layout/PreviewContext.tsx';

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

  usePreviewVisible(true);

  return (
    <div className="media-hub">
      <div className="media-hub-panel">
        <div className="editor-tab-content">
          <div className="editor-tab-panel media-hub-tab">
            <h2 className="panel-heading">Media</h2>
            <MediaLibrary siteId={siteId} mode="panel" selectedItem={selectedItem} onSelectedItemChange={setSelectedItem} />
          </div>
        </div>
      </div>
      {selectedItem !== null && <MediaImagePreviewModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
