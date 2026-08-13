interface UnsavedChangesPromptProps {
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

// Shown whenever navigation away from a page with an unpublished draft
// is blocked (useBlocker, wired in PageEditorPage/MenuEditorPage) -
// the first real modal in this app, rather than window.confirm, since
// the choice here is a genuine three-way one (Save/Discard/Cancel),
// not a plain yes/no. Deliberately forces one of the two resolving
// actions rather than a generic "leave anyway?" dismissal, so a draft
// never gets silently abandoned by navigating away from it, and two
// pages never end up with their own separate pending drafts at once -
// each page's changes are resolved before the next one is ever opened.
export function UnsavedChangesPrompt({ busy, error, onSave, onDiscard, onCancel }: UnsavedChangesPromptProps) {
  return (
    <div className="modal-overlay">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-changes-heading">
        <h2 id="unsaved-changes-heading">Unpublished changes</h2>
        <p>This page has changes that haven&apos;t been published yet. Save them before leaving, or discard them?</p>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={onDiscard} disabled={busy}>
            Discard Changes
          </button>
          <button type="button" className="button-primary" onClick={onSave} disabled={busy}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
