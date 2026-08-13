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
// interruption.
export function ConfirmDialog({ message, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="modal-overlay">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-heading">
        <h2 id="confirm-dialog-heading">Are you sure?</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button-danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
