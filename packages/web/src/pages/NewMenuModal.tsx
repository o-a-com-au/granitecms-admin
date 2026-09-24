import { useState, type FormEvent } from 'react';
import { SiteEditorError } from '../api/site-editor.ts';
import { createSiteMenu } from '../api/site-menus.ts';
import { buildCreateMenuMessage } from '../menus/buildMenuItemMessage.ts';
import { slugify } from './slugify.ts';

export interface NewMenuModalProps {
  siteId: string;
  // Whether the site's agent can store a menu's own display name
  // (content schema 7+, see MENU_NAME_SCHEMA_VERSION). When it can, the
  // Name typed here is saved as the menu's "name"; when it can't, Name
  // only ever suggested the filename, as before.
  supportsMenuNames: boolean;
  onCreated: () => void;
  onClose: () => void;
}

// menu.schema.json is {schemaVersion, name?, items: [{label, url}]},
// additionalProperties: false - a brand new menu starts with an empty
// items array, not a guessed default item. Current content schema
// version (the agent's CURRENT_SCHEMA_VERSION); menu.schema.json only
// requires minimum 1, so this is still accepted by an older agent.
const MENU_SCHEMA_VERSION = 7;

// Mirrors NewPageModal.tsx's own Title -> slugified Path pattern, minus
// the template picker (menus have no templates concept to pick from).
// Created through the agent's own live, no-draft menus endpoint
// (createSiteMenu), never PUT /v1/drafts/*: the agent never reads
// menus from drafts, so a menu created that way never reached the
// site. The placeholder If-Match can never match a real file's etag,
// so attempting to create at an already-occupied path naturally 409s
// through the existing conflict handling below, rather than needing a
// separate pre-flight existence check. Calls onCreated (MenusTabPanel.tsx's own refresh)
// and closes rather than navigating anywhere - there is no more
// separate menu editor route to land on now that items are edited
// inline in the same accordion this modal already sits inside.
export function NewMenuModal({ siteId, supportsMenuNames, onCreated, onClose }: NewMenuModalProps) {
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
    const trimmedName = name.trim();

    try {
      const envelope: Record<string, unknown> =
        supportsMenuNames && trimmedName !== ''
          ? { schemaVersion: MENU_SCHEMA_VERSION, name: trimmedName }
          : { schemaVersion: MENU_SCHEMA_VERSION };
      await createSiteMenu(siteId, trimmedPath, envelope, buildCreateMenuMessage(trimmedName || trimmedPath));
      onCreated();
      onClose();
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
