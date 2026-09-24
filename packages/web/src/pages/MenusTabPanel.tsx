import { useEffect, useState, type KeyboardEvent } from 'react';
import { useSiteMenus } from '../menus/useSiteMenus.ts';
import { MenuItemFormModal } from '../menus/MenuItemFormModal.tsx';
import { MenuItemList } from '../menus/MenuItemList.tsx';
import { deleteSiteMenu, fetchMenuThemeReferences, saveSiteMenuItems, type MenuItem, type SiteMenu } from '../api/site-menus.ts';
import {
  buildDeleteMenuMessage,
  buildRemoveMenuItemMessage,
  buildReorderMenuItemsMessage,
} from '../menus/buildMenuItemMessage.ts';
import { EditMenuModal, type MenuHandleChange } from '../menus/EditMenuModal.tsx';
import { usePreview } from '../layout/PreviewContext.tsx';
import { useSites } from '../sites/useSites.ts';
import { MENU_EDITING_SCHEMA_VERSION, menuDisplayName, menuHandleFromPath, menuPathFromHandle } from './deriveMenuName.ts';
import { NewMenuModal } from './NewMenuModal.tsx';
import { AccordionArrowIcon } from '../sections/AccordionArrowIcon.tsx';
import { AddIcon } from '../sections/AddIcon.tsx';
import { EditIcon } from '../sections/EditIcon.tsx';
import { TrashIcon } from '../sections/TrashIcon.tsx';
import { InstanceRowActions, type InstanceRowAction } from '../sections/InstanceRowActions.tsx';
import { ConfirmDialog } from '../editor/ConfirmDialog.tsx';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { TopLoadingBar } from '../site-status/TopLoadingBar.tsx';
import { buildLoadErrorActions, loadErrorMessage } from '../sites/site-load-error.ts';

export interface MenusTabPanelProps {
  siteId: string;
}

type ItemModalState =
  | { mode: 'create'; menu: SiteMenu }
  | { mode: 'edit'; menu: SiteMenu; index: number; item: MenuItem }
  | null;

// Each menu is now an accordion row (SectionList.tsx/BlockList.tsx's
// own expand-to-reveal-children pattern, reused directly - chevron,
// .instance-list-nested, only one open at a time) rather than a link
// into a separate full-page editor - requested directly. Add/edit/
// delete of an item all happen right here: add/edit through
// MenuItemFormModal.tsx, delete immediately with no confirmation step
// (matching this app's own established precedent for redirects/blocks/
// media). Retires the old MenuEditorPage.tsx route entirely - there is
// nothing left for a separate page to do once items live inline.
// Each menu row now also carries its own Edit (name and handle) and
// Delete actions, alongside the item-level ones inside it. Deleting a
// whole menu is confirmed first, unlike deleting a single item: it
// takes every item with it, and any layout using it renders an empty
// nav - the confirmation names those theme files when the agent can
// say (GET /v1/menus/references), as Edit does for a handle change.
export function MenusTabPanel({ siteId }: MenusTabPanelProps) {
  const { menus, loading, loadError, refresh } = useSiteMenus(siteId);
  const { bumpPreview } = usePreview();
  const { sites } = useSites();
  const siteStatus = sites?.find((site) => site.id === siteId)?.status;
  const supportsMenuEditing = siteStatus?.state === 'ok' && siteStatus.contentSchemaVersion >= MENU_EDITING_SCHEMA_VERSION;
  const [editingMenu, setEditingMenu] = useState<SiteMenu | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SiteMenu | null>(null);
  // Theme files using the menu awaiting delete: undefined while loading,
  // null when that couldn't be found out (an older agent).
  const [deleteReferences, setDeleteReferences] = useState<string[] | null | undefined>(undefined);
  // Shown after a handle change that left theme files using the old one.
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingDelete) {
      return;
    }
    let cancelled = false;
    setDeleteReferences(undefined);
    void fetchMenuThemeReferences(siteId, menuHandleFromPath(pendingDelete.path)).then((files) => {
      if (!cancelled) {
        setDeleteReferences(files);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, pendingDelete]);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [newMenuModalOpen, setNewMenuModalOpen] = useState(false);
  const [itemModalState, setItemModalState] = useState<ItemModalState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleConfirmDeleteMenu(): Promise<void> {
    if (!pendingDelete) {
      return;
    }
    setDeleteBusy(true);
    setActionError(null);
    try {
      await deleteSiteMenu(siteId, pendingDelete, buildDeleteMenuMessage(menuDisplayName(pendingDelete)));
      if (expandedPath === pendingDelete.path) {
        setExpandedPath(null);
      }
      setPendingDelete(null);
      refresh();
      bumpPreview();
    } catch (err) {
      setPendingDelete(null);
      setActionError(err instanceof Error ? err.message : 'Failed to delete that menu');
    } finally {
      setDeleteBusy(false);
    }
  }

  function handleEdited(handleChange: MenuHandleChange | null): void {
    setEditingMenu(null);
    if (handleChange) {
      // The row's path changed with its handle - keep it open if it was.
      if (expandedPath === menuPathFromHandle(handleChange.from)) {
        setExpandedPath(menuPathFromHandle(handleChange.to));
      }
      const files = handleChange.staleThemeReferences;
      setNotice(
        files.length > 0
          ? `Handle changed to ${handleChange.to}. Update menus.${handleChange.from} to menus.${handleChange.to} in ${files.join(', ')} so this menu shows again.`
          : null,
      );
    }
    refresh();
    bumpPreview();
  }

  // Also refreshes: if a name change saved but the handle change then
  // failed, the list is already out of date when the dialog is closed.
  function handleEditClosed(): void {
    setEditingMenu(null);
    refresh();
  }

  function deleteMessage(menu: SiteMenu): string {
    const handle = menuHandleFromPath(menu.path);
    const base = `Delete the "${menuDisplayName(menu)}" menu and all ${menu.items.length} of its items? This cannot be undone.`;
    if (deleteReferences === undefined) {
      return `${base} Checking where your theme uses menus.${handle}...`;
    }
    if (deleteReferences === null) {
      return `${base} Anywhere your theme shows this menu will be left empty.`;
    }
    if (deleteReferences.length === 0) {
      return `${base} Nothing in your theme uses menus.${handle}.`;
    }
    return `${base} Your theme uses menus.${handle} in ${deleteReferences.join(', ')}, which will be left empty.`;
  }

  async function handleDeleteItem(menu: SiteMenu, index: number, item: MenuItem): Promise<void> {
    setActionError(null);
    const menuName = menuDisplayName(menu);
    const items = menu.items.filter((_, i) => i !== index);
    try {
      await saveSiteMenuItems(siteId, menu.path, menu.envelope, items, menu.etag, buildRemoveMenuItemMessage(menuName, item.label));
      refresh();
      // A menu's items typically render inline in a page's own nav
      // (header/footer) - the shared preview viewport keeps showing
      // whatever page was last active even while browsing this tab
      // (PagesHubPage.tsx never clears previewUrl on a tab switch), so
      // without this it would keep showing the now-stale nav until
      // something else happened to reload it.
      bumpPreview();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete that menu item');
    }
  }

  // MenuItemList.tsx only computes the new order (drag-and-drop maths,
  // no network of its own) - saving it is the same read-modify-write
  // against the whole items array every other menu-item mutation here
  // already goes through.
  async function handleReorderItems(menu: SiteMenu, items: MenuItem[]): Promise<void> {
    setActionError(null);
    const menuName = menuDisplayName(menu);
    try {
      await saveSiteMenuItems(siteId, menu.path, menu.envelope, items, menu.etag, buildReorderMenuItemsMessage(menuName));
      refresh();
      bumpPreview();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reorder menu items');
    }
  }

  function handleItemSaved(): void {
    setItemModalState(null);
    refresh();
    bumpPreview();
  }

  if (loadError) {
    return <SiteStatusPanel variant="problem" message={loadErrorMessage(loadError)} actions={buildLoadErrorActions(loadError, siteId, refresh)} />;
  }

  if (loading) {
    return <TopLoadingBar active />;
  }

  return (
    <div className="pages-hub-tab">
      {actionError && <p role="alert">{actionError}</p>}
      {notice && <p role="status">{notice}</p>}
      {menus.length === 0 ? (
        <p>No menus found.</p>
      ) : (
        <ul className="instance-list">
          {menus.map((menu) => {
            const name = menuDisplayName(menu);
            const collapsed = menu.path !== expandedPath;
            const rowActions: InstanceRowAction[] = [
              ...(supportsMenuEditing
                ? [
                    {
                      key: 'edit',
                      label: `Edit ${name}`,
                      icon: <EditIcon />,
                      onClick: () => {
                        setNotice(null);
                        setEditingMenu(menu);
                      },
                    },
                  ]
                : []),
              {
                key: 'delete',
                label: `Delete ${name}`,
                icon: <TrashIcon />,
                variant: 'destructive' as const,
                onClick: () => {
                  setActionError(null);
                  setNotice(null);
                  setPendingDelete(menu);
                },
              },
            ];

            function toggle(): void {
              setExpandedPath(collapsed ? menu.path : null);
            }

            function handleRowKeyDown(event: KeyboardEvent): void {
              // Only the row itself toggles - Enter/Space on one of its
              // own action buttons bubbles here too, and preventDefault
              // would otherwise swallow that button's click.
              if (event.target !== event.currentTarget) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
              }
            }

            return (
              <li className="instance-row" key={menu.path}>
                <div
                  className="instance-row-main"
                  role="button"
                  tabIndex={0}
                  aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
                  onClick={toggle}
                  onKeyDown={handleRowKeyDown}
                >
                  {/* Purely decorative - unlike SectionList.tsx's own
                      chevron (a distinct control alongside row-main's own
                      "Edit" action), there is no second action here for
                      it to own, so it's aria-hidden/untabbable rather than
                      a second focusable control with the exact same
                      accessible name as row-main itself. Still a real
                      button, not a span - button.instance-row-chevron is
                      what instance-rows.css's own specificity-tie
                      workaround actually styles. Its click bubbles to
                      row-main's own onClick below (nothing here stops
                      it), so it still toggles. */}
                  <button type="button" className="instance-row-chevron" tabIndex={-1} aria-hidden="true">
                    <span className={`instance-row-chevron-icon${collapsed ? '' : ' is-expanded'}`}>
                      <AccordionArrowIcon />
                    </span>
                  </button>
                  <span className="instance-row-label">
                    <strong title={name}>{name}</strong>
                  </span>
                  <InstanceRowActions actions={rowActions} />
                </div>
                {!collapsed && (
                  <div className="menus-tab-items">
                    {menu.items.length === 0 ? (
                      <p>No items yet.</p>
                    ) : (
                      <MenuItemList
                        items={menu.items}
                        onReorder={(items) => void handleReorderItems(menu, items)}
                        onEdit={(index, item) => setItemModalState({ mode: 'edit', menu, index, item })}
                        onDelete={(index, item) => void handleDeleteItem(menu, index, item)}
                      />
                    )}
                    <button type="button" className="instance-add-button" onClick={() => setItemModalState({ mode: 'create', menu })}>
                      <AddIcon />
                      Add Menu Item
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="instance-add-button" onClick={() => setNewMenuModalOpen(true)}>
        <AddIcon />
        Add Menu
      </button>
      {newMenuModalOpen && (
        <NewMenuModal
          siteId={siteId}
          supportsMenuEditing={supportsMenuEditing}
          onCreated={refresh}
          onClose={() => setNewMenuModalOpen(false)}
        />
      )}
      {editingMenu && <EditMenuModal siteId={siteId} menu={editingMenu} onSaved={handleEdited} onClose={handleEditClosed} />}
      {pendingDelete && (
        <ConfirmDialog
          message={deleteMessage(pendingDelete)}
          confirmLabel="Delete"
          busy={deleteBusy}
          onConfirm={() => void handleConfirmDeleteMenu()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {itemModalState && (
        <MenuItemFormModal
          siteId={siteId}
          menu={itemModalState.menu}
          menuName={menuDisplayName(itemModalState.menu)}
          mode={itemModalState.mode}
          index={itemModalState.mode === 'edit' ? itemModalState.index : null}
          item={itemModalState.mode === 'edit' ? itemModalState.item : null}
          onSaved={handleItemSaved}
          onClose={() => setItemModalState(null)}
        />
      )}
    </div>
  );
}
