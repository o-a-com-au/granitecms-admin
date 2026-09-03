import { useState, type KeyboardEvent } from 'react';
import { useSiteMenus } from '../menus/useSiteMenus.ts';
import { MenuItemFormModal } from '../menus/MenuItemFormModal.tsx';
import { saveSiteMenuItems, type MenuItem, type SiteMenu } from '../api/site-menus.ts';
import { buildRemoveMenuItemMessage } from '../menus/buildMenuItemMessage.ts';
import { usePreview } from '../layout/PreviewContext.tsx';
import { deriveMenuName } from './deriveMenuName.ts';
import { NewMenuModal } from './NewMenuModal.tsx';
import { AccordionArrowIcon } from '../sections/AccordionArrowIcon.tsx';
import { AddIcon } from '../sections/AddIcon.tsx';
import { EditIcon } from '../sections/EditIcon.tsx';
import { TrashIcon } from '../sections/TrashIcon.tsx';
import { InstanceRowActions } from '../sections/InstanceRowActions.tsx';
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
export function MenusTabPanel({ siteId }: MenusTabPanelProps) {
  const { menus, loading, loadError, refresh } = useSiteMenus(siteId);
  const { bumpPreview } = usePreview();
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [newMenuModalOpen, setNewMenuModalOpen] = useState(false);
  const [itemModalState, setItemModalState] = useState<ItemModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteItem(menu: SiteMenu, index: number, item: MenuItem): Promise<void> {
    setDeleteError(null);
    const menuName = deriveMenuName(menu.path);
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
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete that menu item');
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
      {deleteError && <p role="alert">{deleteError}</p>}
      {menus.length === 0 ? (
        <p>No menus found.</p>
      ) : (
        <ul className="instance-list">
          {menus.map((menu) => {
            const name = deriveMenuName(menu.path);
            const collapsed = menu.path !== expandedPath;

            function toggle(): void {
              setExpandedPath(collapsed ? menu.path : null);
            }

            function handleRowKeyDown(event: KeyboardEvent): void {
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
                  <strong title={name}>{name}</strong>
                </div>
                {!collapsed && (
                  <div className="menus-tab-items">
                    {menu.items.length === 0 ? (
                      <p>No items yet.</p>
                    ) : (
                      <ul className="instance-list instance-list-nested">
                        {menu.items.map((item, index) => (
                          // No stable id in the data model (menu.schema.json's
                          // items are additionalProperties: false - a
                          // client-side id has nowhere to live, same
                          // constraint the old MenuEditorPage.tsx's own item
                          // list had) - index is the only key available, an
                          // accepted trade-off for a short, non-reorderable
                          // list.
                          <li className="instance-row" key={index}>
                            <div className="instance-row-main">
                              {/* An item never nests, but every
                                  instance-row now reserves this column
                                  regardless (requested directly - "clean
                                  this up so they are all rendered the
                                  same way"), matching Sections/Blocks/
                                  Pages/Redirects. */}
                              <span className="instance-row-chevron-spacer" aria-hidden="true" />
                              {/* Reuses redirects-tab-row-label as-is
                                  (pages-hub.css) - a generic single-line
                                  label row shape, not actually redirect-
                                  specific despite the name. Just the
                                  label, no url subtext (requested
                                  directly - a second pass). */}
                              <span className="redirects-tab-row-label">
                                <strong>{item.label || 'Untitled'}</strong>
                              </span>
                              <InstanceRowActions
                                actions={[
                                  {
                                    key: 'edit',
                                    label: `Edit ${item.label || 'menu item'}`,
                                    icon: <EditIcon />,
                                    onClick: () => setItemModalState({ mode: 'edit', menu, index, item }),
                                  },
                                  {
                                    key: 'delete',
                                    label: `Delete ${item.label || 'menu item'}`,
                                    icon: <TrashIcon />,
                                    variant: 'destructive',
                                    onClick: () => void handleDeleteItem(menu, index, item),
                                  },
                                ]}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
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
      {newMenuModalOpen && <NewMenuModal siteId={siteId} onCreated={refresh} onClose={() => setNewMenuModalOpen(false)} />}
      {itemModalState && (
        <MenuItemFormModal
          siteId={siteId}
          menu={itemModalState.menu}
          menuName={deriveMenuName(itemModalState.menu.path)}
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
