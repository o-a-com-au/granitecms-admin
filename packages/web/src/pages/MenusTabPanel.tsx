import { useCallback, useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { listSiteContent, SiteContentError } from '../api/site-content.ts';
import { deriveMenuName, isMenuPath } from './deriveMenuName.ts';
import { NewMenuModal } from './NewMenuModal.tsx';
import { AddIcon } from '../sections/AddIcon.tsx';
import { EditIcon } from '../sections/EditIcon.tsx';
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
// renderable url of its own to show in the hub's big viewport, so the
// title button's own click just navigates straight to the editor
// (same fallback PagesTabPanel's own title button uses for a page
// with no url). Still reuses the exact same row shape as Pages
// (page-tree-cell/page-tree-toggle-spacer/page-tree-title on the left,
// an instance-row-remove Edit link on the right) even though a menu
// never nests and this Edit link duplicates the title's own action -
// requested directly, so every hub tab's rows read as the same shape
// at a glance rather than each tab inventing its own.
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
            <MenuHubRow key={menu.path} siteId={siteId} menu={menu} />
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

interface MenuHubRowProps {
  siteId: string;
  menu: MenuRow;
}

// Same whole-pill-clickable shape as SectionList.tsx's own SectionRow -
// role="button"/onClick on .instance-row-main itself, not just the
// inner title - PagesHubTreeRow's own row previously only wired the
// title button, leaving the rest of the pill inert, which read as
// inconsistent next to Sections/Blocks where clicking anywhere on the
// row opens it (reported directly). The Edit link still needs its own
// stopPropagation so activating it doesn't also fire the row's own
// onClick underneath it.
function MenuHubRow({ siteId, menu }: MenuHubRowProps) {
  const navigate = useNavigate();
  const editHref = `/sites/${siteId}/menus/edit?path=${encodeURIComponent(menu.path)}`;

  function handleRowClick(): void {
    navigate(editHref);
  }

  function handleRowKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRowClick();
    }
  }

  function handleEditLinkClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  return (
    <li className="instance-row">
      <div className="instance-row-main" role="button" tabIndex={0} aria-label={menu.name} onClick={handleRowClick} onKeyDown={handleRowKeyDown}>
        <span className="page-tree-cell">
          <span className="page-tree-toggle-spacer" aria-hidden="true" />
          <span className="page-tree-title" title={menu.name}>
            {menu.name}
          </span>
        </span>
        <Link to={editHref} className="instance-row-remove" aria-label={`Edit ${menu.name}`} onClick={handleEditLinkClick}>
          <EditIcon />
        </Link>
      </div>
    </li>
  );
}
