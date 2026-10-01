import { useEffect, useState } from 'react';
import { listDeletedPages, revertPageToRevision, type DeletedPage } from '../api/site-history.ts';
import { AccordionArrowIcon } from '../sections/AccordionArrowIcon.tsx';
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

// The bottom of the Pages tab: pages that were deleted and aren't back,
// each restorable as it was just before it was deleted. Collapsed, and
// only there at all when something has been deleted. Clicking one shows
// that old version in the preview. Every delete is a git commit, so
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

  if (!pages || pages.length === 0) {
    return null;
  }

  async function restore(page: DeletedPage): Promise<void> {
    setRestoring(page.path);
    setError(null);
    try {
      await revertPageToRevision(siteId, page.ref, page.path, `Restore ${page.title}`);
      onShowVersion?.(page.url, null);
      onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not restore ${page.title}`);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="recently-deleted">
      <button type="button" className="recently-deleted-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className={`instance-row-chevron-icon${open ? ' is-expanded' : ''}`}>
          <AccordionArrowIcon />
        </span>
        Recently deleted ({pages.length})
      </button>
      {open && (
        <ul className="recently-deleted-list">
          {pages.map((page) => (
            <li key={page.path} className="recently-deleted-row">
              <button
                type="button"
                className="recently-deleted-page"
                title="Show it as it was"
                onClick={() => onShowVersion?.(page.url, page.ref)}
              >
                <strong>{page.title}</strong>
                <span className="recently-deleted-meta">
                  {page.url} · deleted by {page.deletedBy}, {formatChangedAt(page.deletedAt)}
                </span>
              </button>
              <button type="button" disabled={restoring !== null} onClick={() => void restore(page)}>
                {restoring === page.path ? 'Restoring...' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
