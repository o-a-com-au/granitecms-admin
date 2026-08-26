import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MediaLibrary } from './MediaLibrary.tsx';
import type { MediaItem } from '../api/site-media.ts';

export interface MediaPickerModalProps {
  siteId: string;
  onSelect: (item: MediaItem) => void;
  onClose: () => void;
}

// Owns the real selectedItem state and passes it down as MediaLibrary's
// controlled props - MediaLibrary itself only ever reports a click, it
// never commits a pick. Select stays disabled until something is
// highlighted (WordPress/Shopify's own click-then-confirm convention,
// not commit-on-first-click).
export function MediaPickerModal({ siteId, onSelect, onClose }: MediaPickerModalProps) {
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  function handleSelect(): void {
    if (selectedItem) {
      onSelect(selectedItem);
    }
  }

  // Rendered via a portal to document.body rather than in place: this
  // field is only ever used from inside SchemaField, which only ever
  // renders inside .editor-fields-panel - and that panel carries a
  // permanent transform (its off-canvas slide animation, still
  // `translateX(0)` even while open, never `none`), which per the CSS
  // spec makes it the containing block for any position: fixed
  // descendant. Without the portal, .modal-overlay's "fixed, cover the
  // viewport" sizing resolves against the panel's own box instead of
  // the viewport, which is what made this look like it was opening
  // inside the edit pane rather than over the whole page.
  return createPortal(
    <div className="modal-overlay">
      <div className="media-picker-modal" role="dialog" aria-modal="true" aria-labelledby="media-picker-heading">
        <h2 id="media-picker-heading">Choose an image</h2>
        <div className="media-picker-modal-body">
          <MediaLibrary siteId={siteId} mode="picker" selectedItem={selectedItem} onSelectedItemChange={setSelectedItem} />
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button-primary" onClick={handleSelect} disabled={!selectedItem}>
            Select
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
