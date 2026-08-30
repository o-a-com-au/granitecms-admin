import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// The same .modal-overlay/.modal/.modal-actions styling
// UnsavedChangesPrompt already established, used here for
// useDraftPublishActions' own confirmingDiscard state (the standalone
// "Discard Changes" button in the top bar) - a styled popup instead of
// a plain window.confirm, so the one destructive, un-undoable action
// left in this app reads as part of it rather than an OS-styled
// interruption. button-primary, the same one accent colour as the
// rest of the editor, not a separate red - there is no second accent
// colour in this app.
//
// Rendered via a portal to document.body rather than in place, same
// reasoning as MediaPickerModal's own portal: this is a generic,
// reusable dialog invoked from several places, some of them nested
// inside a scrolling panel (e.g. PageHistoryTab's own .history-panel,
// itself inside .editor-tab-content's overflow-y: auto) - an ancestor
// with overflow: auto still clips a position: fixed descendant's
// painted output even though its layout position is resolved against
// the viewport, which is what made Restore's confirmation look like it
// was opening inside the History pane instead of over the whole page.
// There's no call site where clipping a confirmation to its parent
// panel would ever be the intended result, so the portal lives here
// once rather than being reapplied at every current and future usage.
export function ConfirmDialog({ message, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return createPortal(
    <div className="modal-overlay">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-heading">
        <h2 id="confirm-dialog-heading">Are you sure?</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button-primary" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
