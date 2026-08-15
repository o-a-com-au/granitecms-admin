import { useState, type FormEvent } from 'react';
import { createSiteRedirect, updateSiteRedirect, type RedirectEntry } from '../api/site-redirects.ts';
import { buildCreateRedirectMessage, buildUpdateRedirectMessage } from './buildRedirectMessage.ts';

export interface RedirectFormModalProps {
  siteId: string;
  mode: 'create' | 'edit';
  // Required (non-null) in edit mode, ignored in create mode.
  entry: RedirectEntry | null;
  onSaved: () => void;
  onClose: () => void;
}

// Reuses .modal-overlay/.modal/.modal-actions as-is (ConfirmDialog.tsx's
// own precedent) - a 3-field form fits the existing 420px .modal fine,
// no custom sizing class needed the way Media/Enlarge needed one.
export function RedirectFormModal({ siteId, mode, entry, onSaved, onClose }: RedirectFormModalProps) {
  const [from, setFrom] = useState(entry?.from ?? '');
  const [to, setTo] = useState(entry?.to ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const trimmedFrom = from.trim();
    const trimmedTo = to.trim();
    const trimmedNote = note.trim();
    const noteValue = trimmedNote === '' ? undefined : trimmedNote;

    try {
      if (mode === 'create') {
        await createSiteRedirect(siteId, trimmedFrom, trimmedTo, noteValue, buildCreateRedirectMessage(trimmedFrom, trimmedTo));
      } else {
        await updateSiteRedirect(siteId, trimmedFrom, trimmedTo, noteValue, buildUpdateRedirectMessage(trimmedFrom, trimmedTo));
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save that redirect');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="redirect-form-heading">
        <h2 id="redirect-form-heading">{mode === 'create' ? 'Add Redirect' : 'Edit Redirect'}</h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label>
            From
            {/* Not editable once created - `from` is the entry's own
                key (PUT matches by from, there is no rename-from
                operation). Deleting and re-creating is the only way
                to change it. */}
            <input
              type="text"
              placeholder="/old-page"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              disabled={mode === 'edit'}
              required
            />
          </label>
          <label>
            To
            <input type="text" placeholder="/new-page" value={to} onChange={(event) => setTo(event.target.value)} required />
          </label>
          <label>
            Note (optional)
            <input type="text" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={busy}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
