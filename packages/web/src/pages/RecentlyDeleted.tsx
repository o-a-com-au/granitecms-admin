import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { listDeletedPages, revertPageToRevision, type DeletedPage } from '../api/site-history.ts';
import { formatChangedAt } from './formatChangedAt.ts';

export interface RecentlyDeletedProps {
  siteId: string;
  // Bumped by the Pages panel whenever its list reloads (a delete, a
  // restore), so this reloads with it.
  reloadToken: number;
  onRestored: () => void;
  // Shows a page in the preview, at a past version (ref) or as it is
  // now (null). Owned by the Pages hub, which owns the preview.
  onShowVersion?: (url: string, ref: string | null) => void;
}

// "Recently deleted (n)", a quiet link beside Add Page that opens a
// popup of pages that were deleted and aren't back, each restorable as
// it was just before it was deleted. Only there at all when something
// has been deleted. Preview closes the popup so the old version can be
// seen in the preview behind it. Every delete is a git commit, so
// nothing is ever truly gone; this is what makes that usable.
export function RecentlyDeleted({ siteId, reloadToken, onRestored, onShowVersion }: RecentlyDeletedProps) {
  const [pages, setPages] = useState<DeletedPage[] | null>(null);
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listDeletedPages(siteId).then((found) => {
      if (!cancelled) {
        setPages(found);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, reloadToken]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && restoring === null) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, restoring]);

  if (!pages || pages.length === 0) {
    return null;
  }

  function close(): void {
    setOpen(false);
    setError(null);
  }

  function preview(page: DeletedPage): void {
    close();
    onShowVersion?.(page.url, page.ref);
  }

  async function restore(page: DeletedPage): Promise<void> {
    setRestoring(page.path);
    setError(null);
    try {
      await revertPageToRevision(siteId, page.ref, page.path, `Restore ${page.title}`);
      close();
      onShowVersion?.(page.url, null);
      onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not restore ${page.title}`);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <>
      <button type="button" className="recently-deleted-link" onClick={() => setOpen(true)}>
        Recently deleted ({pages.length})
      </button>
      {open &&
        createPortal(
          <div
            className="modal-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && restoring === null) {
                close();
              }
            }}
          >
            <div className="modal recently-deleted-modal" role="dialog" aria-modal="true" aria-labelledby="recently-deleted-heading">
              <h2 id="recently-deleted-heading">Recently deleted</h2>
              <p>Pages deleted in the last 90 days. Restoring a page puts it back as it was just before it was deleted.</p>
              <ul className="recently-deleted-list">
                {pages.map((page) => (
                  <li key={page.path} className="recently-deleted-row">
                    <div className="recently-deleted-page">
                      <strong>{page.title}</strong>
                      <span className="recently-deleted-meta">
                        {page.url} · deleted by {page.deletedBy}, {formatChangedAt(page.deletedAt)}
                      </span>
                    </div>
                    <button type="button" disabled={restoring !== null} onClick={() => preview(page)} aria-label={`Preview ${page.title}`}>
                      Preview
                    </button>
                    <button type="button" disabled={restoring !== null} onClick={() => void restore(page)} aria-label={`Restore ${page.title}`}>
                      {restoring === page.path ? 'Restoring...' : 'Restore'}
                    </button>
                  </li>
                ))}
              </ul>
              {error && <p role="alert">{error}</p>}
              <div className="modal-actions">
                <button type="button" onClick={close} disabled={restoring !== null}>
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
