import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { deleteSiteRedirect, type RedirectEntry } from '../api/site-redirects.ts';
import { useSiteRedirects } from '../redirects/useSiteRedirects.ts';
import { buildDeleteRedirectMessage } from '../redirects/buildRedirectMessage.ts';
import { RedirectFormModal } from '../redirects/RedirectFormModal.tsx';
import { EditIcon } from '../sections/EditIcon.tsx';
import { TrashIcon } from '../sections/TrashIcon.tsx';
import { InstanceRowActions } from '../sections/InstanceRowActions.tsx';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { TopLoadingBar } from '../site-status/TopLoadingBar.tsx';
import { buildLoadErrorActions, loadErrorMessage } from '../sites/site-load-error.ts';

export interface RedirectsTabPanelProps {
  siteId: string;
  // Registers this panel's own search+Add toolbar into PagesHubPage.tsx's
  // .panel-heading-utilities slot instead of rendering it as part of
  // this component's own (scrolling) content - requested directly, so
  // it stays visible above the list rather than scrolling away with
  // it. Optional purely so this component still renders sensibly if
  // ever used somewhere with no such slot to register into (nothing
  // does today).
  onUtilitiesChange?: (node: ReactNode | null) => void;
}

type ModalState = { mode: 'create' } | { mode: 'edit'; entry: RedirectEntry } | null;

// Matches either side of the redirect, not just From - MediaLibrary.tsx's
// own matchesSearch is the closest precedent (also a single case-
// insensitive substring check), but a redirect has no one "name" field
// the way a media file does.
function matchesSearch(entry: RedirectEntry, query: string): boolean {
  if (query.trim() === '') {
    return true;
  }
  const needle = query.trim().toLowerCase();
  return entry.from.toLowerCase().includes(needle) || entry.to.toLowerCase().includes(needle);
}

// From becomes the row's own primary label, To renders as smaller
// muted text underneath it (a two-line row, not a separate column) -
// Note is dropped from the visible list entirely. Edit/Delete go
// through InstanceRowActions.tsx now (shared with Menus items), not a
// hand-rolled pair borrowing button.instance-row-chevron's own class
// for Edit purely because it produced the same-looking box - none of
// the old four columns (From/To/Note/actions) fit this panel's own
// --editor-sidebar-width side by side.
export function RedirectsTabPanel({ siteId, onUtilitiesChange }: RedirectsTabPanelProps) {
  const { entries, loading, loadError, refresh } = useSiteRedirects(siteId);
  const [search, setSearch] = useState('');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const filteredEntries = entries.filter((entry) => matchesSearch(entry, search));

  // useMemo, not a bare JSX expression - the registration effect below
  // depends on this node by reference, and a fresh element every
  // render would re-register (and so re-render the parent) on every
  // render in turn, an infinite loop - see PagesHubPage.tsx's own
  // deviceToggleNode/PageEditorPage.tsx's identical precedent for the
  // fuller explanation of this exact pitfall.
  const utilities = useMemo(
    () => (
      <div className="panel-toolbar">
        <input
          type="search"
          className="content-search"
          placeholder="Search redirects"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" onClick={() => setModalState({ mode: 'create' })}>
          Add
        </button>
      </div>
    ),
    [search],
  );

  // Registered unconditionally, before either early return below (React's
  // own rule - every hook call must run in the same order on every
  // render) - PagesHubPage.tsx's slot naturally shows nothing while
  // this returns null, same as any other unmount, so a loading/error
  // state simply hides the toolbar along with everything else rather
  // than needing its own separate branch here.
  useEffect(() => {
    onUtilitiesChange?.(utilities);
    return () => onUtilitiesChange?.(null);
  }, [onUtilitiesChange, utilities]);

  // No confirmation dialog - matches this app's own established
  // precedent for both Media deletion and the project owner's explicit
  // "no confirmation on deleting blocks/sections" call.
  async function handleDelete(entry: RedirectEntry): Promise<void> {
    setDeleteError(null);
    try {
      await deleteSiteRedirect(siteId, entry.from, buildDeleteRedirectMessage(entry.from));
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete that redirect');
    }
  }

  function handleSaved(): void {
    setModalState(null);
    refresh();
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
      {entries.length === 0 ? (
        <p>No redirects yet.</p>
      ) : filteredEntries.length === 0 ? (
        <p>No redirects match your search.</p>
      ) : (
        <ul className="instance-list">
          {filteredEntries.map((entry) => (
            <li className="instance-row" key={entry.from}>
              <div className="instance-row-main">
                {/* No chevron/spacer - Redirects never have anything to
                    expand, unlike Sections/Pages/the menu row itself
                    (where a mix of chevron/no-chevron siblings in the
                    SAME list needs to stay aligned), so there's no
                    alignment case to serve by reserving the column here
                    at all (requested directly - a second pass). */}
                <span className="redirects-tab-row-label">
                  <strong>{entry.from}</strong>
                  <span className="redirects-tab-row-to">{entry.to}</span>
                </span>
                <InstanceRowActions
                  actions={[
                    {
                      key: 'edit',
                      label: `Edit redirect from ${entry.from}`,
                      icon: <EditIcon />,
                      onClick: () => setModalState({ mode: 'edit', entry }),
                    },
                    {
                      key: 'delete',
                      label: `Delete redirect from ${entry.from}`,
                      icon: <TrashIcon />,
                      variant: 'destructive',
                      onClick: () => void handleDelete(entry),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {modalState && (
        <RedirectFormModal
          siteId={siteId}
          mode={modalState.mode}
          entry={modalState.mode === 'edit' ? modalState.entry : null}
          onSaved={handleSaved}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  );
}
