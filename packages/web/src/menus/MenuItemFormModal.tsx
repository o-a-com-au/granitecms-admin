import { useState, type FormEvent } from 'react';
import { saveSiteMenuItems, type MenuItem, type SiteMenu } from '../api/site-menus.ts';
import { buildAddMenuItemMessage, buildUpdateMenuItemMessage } from './buildMenuItemMessage.ts';

export interface MenuItemFormModalProps {
  siteId: string;
  menu: SiteMenu;
  menuName: string;
  mode: 'create' | 'edit';
  // Required (non-null) in edit mode, ignored in create mode.
  index: number | null;
  item: MenuItem | null;
  onSaved: () => void;
  onClose: () => void;
}

// Reuses .modal-overlay/.modal/.modal-actions as-is, same as
// RedirectFormModal.tsx's own precedent - a 2-field form fits the
// existing 420px .modal fine. Unlike a redirect (its own dedicated
// /v1/redirects entry, addressed by "from"), a menu item has no
// standalone identity of its own - saving one always means read-
// modify-write the whole menu's items array back through
// saveSiteMenuItems, keyed by array index rather than any field on the
// item itself.
export function MenuItemFormModal({ siteId, menu, menuName, mode, index, item, onSaved, onClose }: MenuItemFormModalProps) {
  const [label, setLabel] = useState(item?.label ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const trimmedLabel = label.trim();
    const trimmedUrl = url.trim();
    const newItem: MenuItem = { label: trimmedLabel, url: trimmedUrl };
    const items =
      mode === 'create'
        ? [...menu.items, newItem]
        : menu.items.map((existing, i) => (i === index ? newItem : existing));
    const message =
      mode === 'create' ? buildAddMenuItemMessage(menuName, trimmedLabel) : buildUpdateMenuItemMessage(menuName, trimmedLabel);

    try {
      await saveSiteMenuItems(siteId, menu.path, menu.envelope, items, menu.etag, message);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save that menu item');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="menu-item-form-heading">
        <h2 id="menu-item-form-heading">{mode === 'create' ? 'Add Menu Item' : 'Edit Menu Item'}</h2>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Label
            <input type="text" value={label} onChange={(event) => setLabel(event.target.value)} required />
          </label>
          <label>
            URL
            <input type="text" placeholder="/about" value={url} onChange={(event) => setUrl(event.target.value)} required />
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
