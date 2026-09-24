import { useEffect, useState, type FormEvent } from 'react';
import { fetchMenuThemeReferences, renameSiteMenuHandle, saveSiteMenuItems, type SiteMenu } from '../api/site-menus.ts';
import { MENU_HANDLE_PATTERN, deriveMenuName, menuDisplayName, menuHandleFromPath } from '../pages/deriveMenuName.ts';
import { buildChangeMenuHandleMessage, buildRenameMenuMessage } from './buildMenuItemMessage.ts';

export interface MenuHandleChange {
  from: string;
  to: string;
  // Theme files still using the old handle after the change.
  staleThemeReferences: string[];
}

export interface EditMenuModalProps {
  siteId: string;
  menu: SiteMenu;
  // handleChange is null when only the name changed.
  onSaved: (handleChange: MenuHandleChange | null) => void;
  onClose: () => void;
}

function listFiles(files: string[]): string {
  return files.join(', ');
}

// Edits a menu's display name (menu.schema.json's optional "name") and
// its handle (the filename, what a layout writes as menus.<handle>).
// The name is free to change. The handle is too, as in Shopify, but
// every layout still using the old one then shows an empty menu, so
// the theme files that use it are looked up as soon as this opens and
// named in the warning before anything is saved.
//
// Two separate writes when both change - the name is saved first, at
// the menu's current path, then the handle is changed with the etag
// that save returned. If the second fails, the first has already
// happened; the saved name and fresh etag are kept here so trying
// again only retries the handle change, rather than tripping over a
// conflict with our own first write.
export function EditMenuModal({ siteId, menu, onSaved, onClose }: EditMenuModalProps) {
  const oldHandle = menuHandleFromPath(menu.path);
  const [name, setName] = useState(menu.name ?? '');
  const [handle, setHandle] = useState(oldHandle);
  const [savedName, setSavedName] = useState(menu.name ?? '');
  const [etag, setEtag] = useState(menu.etag);
  const [envelope, setEnvelope] = useState(menu.envelope);
  // undefined while loading, null when it couldn't be found out.
  const [references, setReferences] = useState<string[] | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMenuThemeReferences(siteId, oldHandle).then((files) => {
      if (!cancelled) {
        setReferences(files);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, oldHandle]);

  const trimmedName = name.trim();
  const trimmedHandle = handle.trim();
  const handleChanged = trimmedHandle !== oldHandle;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const nameChanged = trimmedName !== savedName;
    if (!nameChanged && !handleChanged) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);

    let currentEtag = etag;
    const newDisplayName = trimmedName === '' ? deriveMenuName(menu.path) : trimmedName;

    try {
      if (nameChanged) {
        // Clearing the field removes "name" altogether, falling back to
        // the handle-derived label, rather than saving an empty string
        // the schema would reject anyway.
        const rest = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== 'name'));
        const nextEnvelope = trimmedName === '' ? rest : { ...rest, name: trimmedName };
        const message = buildRenameMenuMessage(menuDisplayName({ path: menu.path, name: savedName || null }), newDisplayName);
        currentEtag = await saveSiteMenuItems(siteId, menu.path, nextEnvelope, menu.items, currentEtag, message);
        setEtag(currentEtag);
        setEnvelope(nextEnvelope);
        setSavedName(trimmedName);
      }

      if (handleChanged) {
        const result = await renameSiteMenuHandle(
          siteId,
          oldHandle,
          trimmedHandle,
          currentEtag,
          buildChangeMenuHandleMessage(newDisplayName, oldHandle, trimmedHandle),
        );
        onSaved({ from: oldHandle, to: trimmedHandle, staleThemeReferences: result.staleThemeReferences });
        return;
      }
      onSaved(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save that menu');
      setBusy(false);
    }
  }

  function handleWarning(): string {
    const before = `menus.${oldHandle}`;
    const after = `menus.${trimmedHandle || 'handle'}`;
    if (references === undefined) {
      return `Checking where your theme uses ${before}...`;
    }
    if (references === null) {
      return `Anything in your theme that uses ${before} will show nothing until it's changed to ${after}.`;
    }
    if (references.length === 0) {
      return `Nothing in your theme uses ${before}, so this is safe to change.`;
    }
    return `Your theme uses ${before} in ${listFiles(references)}. They will show nothing until they're changed to ${after}.`;
  }

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-menu-heading">
        <h2 id="edit-menu-heading">Edit Menu</h2>
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
            Handle
            <input
              type="text"
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              pattern={MENU_HANDLE_PATTERN}
              title="Letters, numbers, hyphens and underscores only"
              required
            />
          </label>
          {handleChanged ? (
            <p role="status">{handleWarning()}</p>
          ) : (
            <p>Your theme uses the handle to show this menu.</p>
          )}
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
