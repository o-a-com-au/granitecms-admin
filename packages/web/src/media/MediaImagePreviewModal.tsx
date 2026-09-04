import { createPortal } from 'react-dom';
import type { MediaItem } from '../api/site-media.ts';
import { CloseIcon } from '../sections/CloseIcon.tsx';

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
//
// No header bar any more (requested directly, with a mockup) - Close
// floats over the image's own top-right corner instead of sitting in a
// row above it, and the filename moves to a caption below the image.
// aria-label replaces the old aria-labelledby (which pointed at the
// now-removed heading) - the dialog's own accessible name still needs
// to be the file name somewhere, just not visibly rendered as a <h2>.
export function MediaImagePreviewModal({ item, onClose }: MediaImagePreviewModalProps) {
  return createPortal(
    <div className="modal-overlay">
      <div className="media-image-preview-modal" role="dialog" aria-modal="true" aria-label={item.name}>
        <button
          type="button"
          className="media-image-preview-modal-close image-overlay-button"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
        <div className="media-image-preview-modal-body" data-theme="light">
          <img src={item.url} alt={item.name} />
        </div>
        <p className="media-image-preview-modal-filename">{item.name}</p>
      </div>
    </div>,
    document.body,
  );
}
