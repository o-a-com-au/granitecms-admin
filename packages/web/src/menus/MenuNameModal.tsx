import { useState, type FormEvent } from 'react';
import { saveSiteMenuItems, type SiteMenu } from '../api/site-menus.ts';
import { deriveMenuName, menuDisplayName, menuIdFromPath } from '../pages/deriveMenuName.ts';
import { buildRenameMenuMessage } from './buildMenuItemMessage.ts';

export interface MenuNameModalProps {
  siteId: string;
  menu: SiteMenu;
  onSaved: () => void;
  onClose: () => void;
}

// Renames a menu by its display name only (menu.schema.json's optional
// "name"), never its ID: layouts reference a menu as menus.<id>, so
// changing the ID would silently empty every nav using it. The ID is
// shown read-only so it's clear what a theme still calls it. Clearing the field removes "name" altogether, falling
// back to the filename-derived label, rather than saving an empty
// string the schema would reject anyway.
export function MenuNameModal({ siteId, menu, onSaved, onClose }: MenuNameModalProps) {
  const [name, setName] = useState(menu.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = menuIdFromPath(menu.path);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const trimmed = name.trim();
    const rest = Object.fromEntries(Object.entries(menu.envelope).filter(([key]) => key !== 'name'));
    const envelope = trimmed === '' ? rest : { ...rest, name: trimmed };
    const message = buildRenameMenuMessage(menuDisplayName(menu), trimmed === '' ? deriveMenuName(menu.path) : trimmed);

    try {
      await saveSiteMenuItems(siteId, menu.path, envelope, menu.items, menu.etag, message);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename that menu');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="menu-name-heading">
        <h2 id="menu-name-heading">Edit Menu</h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Name
            <input
              type="text"
              placeholder={deriveMenuName(menu.path)}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            ID
            <input type="text" value={id} readOnly />
          </label>
          <p>Your theme uses the ID to show this menu, so it stays the same when you rename it.</p>
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
