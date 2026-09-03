import { useState } from 'react';
import { deleteSiteRedirect, type RedirectEntry } from '../api/site-redirects.ts';
import { useSiteRedirects } from '../redirects/useSiteRedirects.ts';
import { buildDeleteRedirectMessage } from '../redirects/buildRedirectMessage.ts';
import { RedirectFormModal } from '../redirects/RedirectFormModal.tsx';
import { AddIcon } from '../sections/AddIcon.tsx';
import { EditIcon } from '../sections/EditIcon.tsx';
import { TrashIcon } from '../sections/TrashIcon.tsx';
import { InstanceRowActions } from '../sections/InstanceRowActions.tsx';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { TopLoadingBar } from '../site-status/TopLoadingBar.tsx';
import { buildLoadErrorActions, loadErrorMessage } from '../sites/site-load-error.ts';

export interface RedirectsTabPanelProps {
  siteId: string;
}

type ModalState = { mode: 'create' } | { mode: 'edit'; entry: RedirectEntry } | null;

// From becomes the row's own primary label, To renders as smaller
// muted text underneath it (a two-line row, not a separate column) -
// Note is dropped from the visible list entirely. Edit/Delete go
// through InstanceRowActions.tsx now (shared with Menus items), not a
// hand-rolled pair borrowing button.instance-row-chevron's own class
// for Edit purely because it produced the same-looking box - none of
// the old four columns (From/To/Note/actions) fit this panel's own
// --editor-sidebar-width side by side.
export function RedirectsTabPanel({ siteId }: RedirectsTabPanelProps) {
  const { entries, loading, loadError, refresh } = useSiteRedirects(siteId);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      ) : (
        <ul className="instance-list">
          {entries.map((entry) => (
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
      <button type="button" className="instance-add-button" onClick={() => setModalState({ mode: 'create' })}>
        <AddIcon />
        Add Redirect
      </button>
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
