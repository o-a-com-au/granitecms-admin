import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listSiteContent, SiteContentError } from '../api/site-content.ts';
import { deriveMenuName, isMenuPath } from './deriveMenuName.ts';
import { NewMenuModal } from './NewMenuModal.tsx';
import { AddIcon } from '../sections/AddIcon.tsx';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { TopLoadingBar } from '../site-status/TopLoadingBar.tsx';
import { buildLoadErrorActions, loadErrorMessage, type LoadError } from '../sites/site-load-error.ts';

export interface MenusTabPanelProps {
  siteId: string;
}

interface MenuRow {
  path: string;
  name: string;
}

// Narrowed to just the menu's own name - the old "Menu items" preview
// column (a comma-joined list of every item's label) is dropped
// entirely, no room for it in this panel's own --editor-sidebar-width.
// No preview affordance here (unlike PagesTabPanel) - a menu has no
// renderable url of its own to show in the hub's big viewport.
export function MenusTabPanel({ siteId }: MenusTabPanelProps) {
  const [menus, setMenus] = useState<MenuRow[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [newMenuModalOpen, setNewMenuModalOpen] = useState(false);
  const retry = useCallback(() => setReloadToken((count) => count + 1), []);

  useEffect(() => {
    let cancelled = false;
    setMenus(null);
    setError(null);

    listSiteContent(siteId, {})
      .then(async (entries) => {
        const menuEntries = entries.filter((entry) => isMenuPath(entry.path));
        // Only the name is shown now, so the menu's own content never
        // needs reading here any more - the old MenusPage.tsx's own
        // per-item-labels fetch existed purely to build the now-dropped
        // "Menu items" preview column.
        const rows = menuEntries.map((entry): MenuRow => ({ path: entry.path, name: deriveMenuName(entry.path) }));
        if (!cancelled) {
          setMenus(rows);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        if (err instanceof SiteContentError) {
          setError({ reason: err.reason, message: err.message });
        } else {
          setError({ reason: 'error', message: err instanceof Error ? err.message : 'Failed to load menus' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, reloadToken]);

  if (error) {
    return <SiteStatusPanel variant="problem" message={loadErrorMessage(error)} actions={buildLoadErrorActions(error, siteId, retry)} />;
  }

  if (menus === null) {
    return <TopLoadingBar active />;
  }

  return (
    <div className="pages-hub-tab">
      {menus.length === 0 ? (
        <p>No menus found.</p>
      ) : (
        <ul className="instance-list">
          {menus.map((menu) => (
            <li className="instance-row" key={menu.path}>
              <div className="instance-row-main">
                <Link to={`/sites/${siteId}/menus/edit?path=${encodeURIComponent(menu.path)}`}>{menu.name}</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="instance-add-button" onClick={() => setNewMenuModalOpen(true)}>
        <AddIcon />
        Add Menu
      </button>
      {newMenuModalOpen && <NewMenuModal siteId={siteId} onClose={() => setNewMenuModalOpen(false)} />}
    </div>
  );
}
