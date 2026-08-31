import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { saveSiteDraft, SiteEditorError } from '../api/site-editor.ts';
import { slugify } from './slugify.ts';

export interface NewMenuModalProps {
  siteId: string;
  onClose: () => void;
}

// menu.schema.json is {schemaVersion, items: [{label, url}]},
// additionalProperties: false - deriveMenuName.ts's own comment
// confirms menus have no name/label field at all, so a brand new one
// starts with an empty items array, not a guessed default item.
const MENU_SCHEMA_VERSION = 1;

// Mirrors NewPageModal.tsx's own Title -> slugified Path pattern, minus
// the template picker (menus have no templates concept to pick from).
// Creating the menu is the same PUT /v1/drafts/* every other save
// already goes through (saveSiteDraft, unchanged) - the placeholder '*'
// If-Match can never match a real file's etag, so attempting to create
// at an already-occupied path naturally 409s through the existing
// conflict handling below, rather than needing a separate pre-flight
// existence check.
export function NewMenuModal({ siteId, onClose }: NewMenuModalProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [pathTouched, setPathTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-follows Name until the user types into Path directly
  // themselves - same pattern as NewPageModal.tsx's own Title -> Path
  // suggestion.
  const suggestedPath = name.trim() === '' ? '' : `menus/${slugify(name)}.json`;
  const displayedPath = pathTouched ? path : suggestedPath;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const trimmedPath = displayedPath.trim();

    try {
      const content = { schemaVersion: MENU_SCHEMA_VERSION, items: [] };
      await saveSiteDraft(siteId, trimmedPath, JSON.stringify(content, null, 2), '*');
      navigate(`/sites/${siteId}/menus/edit?path=${encodeURIComponent(trimmedPath)}`);
    } catch (err) {
      if (err instanceof SiteEditorError && err.reason === 'conflict') {
        setError('A menu already exists at that path');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create that menu');
      }
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-menu-heading">
        <h2 id="new-menu-heading">New Menu</h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Name
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Path
            <input
              type="text"
              placeholder="menus/my-new-menu.json"
              value={displayedPath}
              onChange={(event) => {
                setPath(event.target.value);
                setPathTouched(true);
              }}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={busy}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
