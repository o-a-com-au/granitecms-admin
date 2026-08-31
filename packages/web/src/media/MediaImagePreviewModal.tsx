import { createPortal } from 'react-dom';
import type { MediaItem } from '../api/site-media.ts';

export interface MediaImagePreviewModalProps {
  item: MediaItem;
  onClose: () => void;
}

// Clicking a thumbnail in the Media panel (MediaLibraryPage.tsx) opens
// this instead of pushing the image into the shared preview viewport -
// the viewport is for previewing a SITE PAGE, and a media file being
// briefly enlarged has nothing to do with that (it was also, in
// practice, easy to mistake for the page preview reloading). Same
// centred-overlay shape every other dialog in this app already uses
// (modal.css's .modal-overlay), via a portal for the same reason
// MediaPickerModal.tsx's own docblock explains - reachable from deep
// inside a transformed ancestor whose own position: fixed containing-
// block would otherwise misplace it.
export function MediaImagePreviewModal({ item, onClose }: MediaImagePreviewModalProps) {
  return createPortal(
    <div className="modal-overlay">
      <div className="media-image-preview-modal" role="dialog" aria-modal="true" aria-labelledby="media-image-preview-heading">
        <div className="media-image-preview-modal-header">
          <h2 id="media-image-preview-heading">{item.name}</h2>
          <button type="button" className="media-image-preview-modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="media-image-preview-modal-body">
          <img src={item.url} alt={item.name} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
