import { useState } from 'react';
import { useParams } from 'react-router';
import { deleteSiteRedirect, type RedirectEntry } from '../api/site-redirects.ts';
import { useSiteRedirects } from '../redirects/useSiteRedirects.ts';
import { buildDeleteRedirectMessage } from '../redirects/buildRedirectMessage.ts';
import { RedirectFormModal } from '../redirects/RedirectFormModal.tsx';
import { TrashIcon } from '../sections/TrashIcon.tsx';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { TopLoadingBar } from '../site-status/TopLoadingBar.tsx';
import { buildLoadErrorActions, loadErrorMessage } from '../sites/site-load-error.ts';

type ModalState = { mode: 'create' } | { mode: 'edit'; entry: RedirectEntry } | null;

export function RedirectsPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const { entries, loading, loadError, refresh } = useSiteRedirects(siteId);
  const [modalState, setModalState] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // No confirmation dialog - matches this app's own established
  // precedent for both Media deletion and the project owner's
  // explicit "no confirmation on deleting blocks/sections" call.
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
    return (
      <div className="list-page">
        <SiteStatusPanel
          variant="problem"
          message={loadErrorMessage(loadError)}
          actions={buildLoadErrorActions(loadError, siteId, refresh)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="list-page">
        <TopLoadingBar active />
      </div>
    );
  }

  return (
    <div className="list-page">
      <div className="list-page-inner">
        <div className="redirects-header">
          <h1>Redirects</h1>
          <button type="button" className="button-primary" onClick={() => setModalState({ mode: 'create' })}>
            + Add Redirect
          </button>
        </div>

        {deleteError && <p role="alert">{deleteError}</p>}

        {entries.length === 0 ? (
          <p>No redirects yet.</p>
        ) : (
          <table className="list-table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.from}>
                  <td>{entry.from}</td>
                  <td>{entry.to}</td>
                  <td>{entry.note ?? ''}</td>
                  <td>
                    <button type="button" onClick={() => setModalState({ mode: 'edit', entry })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="instance-row-remove"
                      aria-label={`Delete redirect from ${entry.from}`}
                      onClick={() => void handleDelete(entry)}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
