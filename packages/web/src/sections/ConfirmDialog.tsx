interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shared by SectionList/BlockList's own remove-with-confirmation flow -
// the same modal styling as UnsavedChangesPrompt (.modal-overlay/
// .modal/.modal-actions), replacing a plain window.confirm for a
// destructive action that (unlike the browser's own dialog) reads as
// part of this app rather than an OS-styled interruption, and can
// carry the resolved schema title instead of window.confirm's
// single-line string.
export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="modal-overlay">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-heading">
        <h2 id="confirm-dialog-heading">Are you sure?</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
