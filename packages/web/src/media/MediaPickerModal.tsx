import { useState } from 'react';
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

  return (
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
    </div>
  );
}
