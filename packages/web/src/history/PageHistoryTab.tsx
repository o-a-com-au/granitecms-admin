import { useEffect, useState } from 'react';
import { fetchPageHistory, revertPageToRevision, type HistoryCommit } from '../api/site-history.ts';
import { ConfirmDialog } from '../editor/ConfirmDialog.tsx';
import { buildRestoreMessage } from './buildRestoreMessage.ts';

const DEFAULT_LIMIT = 100;
const LOAD_MORE_STEP = 100;

interface PageHistoryTabProps {
  siteId: string;
  path: string;
  // The commit hash currently rendered in the main viewport, or null
  // for the normal current-version preview - owned by PageEditorPage
  // (it also feeds PreviewFrame), this component only ever reads and
  // requests changes to it via onSelectRevision.
  previewRef: string | null;
  onSelectRevision: (hash: string | null) => void;
  // Fired after a successful Restore, so PageEditorPage can reload the
  // page's own current draft/live content - a restore changes what
  // "current" means, and this tab has no direct access to that state.
  onRestored: () => void;
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

function formatCommitDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// WordPress-style rollback-by-date, replacing the old standalone
// history screen: a list of commits for this page, in the editor's
// own left panel. Clicking a row previews that revision in the main
// viewport (via previewRef/onSelectRevision, threaded up to
// PreviewFrame) rather than showing a JSON/text diff - there is no
// arbitrary two-revision compare here, only implicitly "this version
// vs current". Restoring reuses the same revertPageToRevision plumbing
// PageHistoryPage used, with an auto-generated commit message (no
// window.prompt) matching Publish/Redirects' own convention.
export function PageHistoryTab({ siteId, path, previewRef, onSelectRevision, onRestored }: PageHistoryTabProps) {
  const [commits, setCommits] = useState<HistoryCommit[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCheckpoints, setShowCheckpoints] = useState(false);

  const [confirmingRestore, setConfirmingRestore] = useState<HistoryCommit | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    fetchPageHistory(siteId, path, limit)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setCommits(result.commits);
        setHasMore(result.hasMore);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Failed to load history');
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, path, limit]);

  async function handleConfirmRestore(): Promise<void> {
    if (!confirmingRestore) {
      return;
    }
    setActionBusy(true);
    setActionError(null);
    try {
      await revertPageToRevision(siteId, confirmingRestore.hash, path, buildRestoreMessage(confirmingRestore.date));
      const result = await fetchPageHistory(siteId, path, limit);
      setCommits(result.commits);
      setHasMore(result.hasMore);
      setConfirmingRestore(null);
      onSelectRevision(null);
      onRestored();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to restore this version');
    } finally {
      setActionBusy(false);
    }
  }

  const visibleCommits = commits?.filter((commit) => showCheckpoints || !commit.isCheckpoint) ?? null;

  return (
    <div className="history-panel">
      <h2 className="panel-heading">History</h2>
      <p className="history-note">
        Reverting only affects the published version - an open draft on this page is unaffected.
      </p>

      {loadError && <p role="alert">{loadError}</p>}
      {!loadError && commits === null && <p>Loading...</p>}

      {!loadError && commits !== null && (
        <>
          {previewRef !== null && (
            <button type="button" className="history-back-to-current" onClick={() => onSelectRevision(null)}>
              ← Back to current version
            </button>
          )}

          <label className="history-checkpoint-toggle">
            <input
              type="checkbox"
              checked={showCheckpoints}
              onChange={(event) => setShowCheckpoints(event.target.checked)}
            />
            Show checkpoint commits
          </label>

          {visibleCommits?.length === 0 && <p>No commits to show.</p>}

          {visibleCommits && visibleCommits.length > 0 && (
            <ul className="instance-list history-list">
              {visibleCommits.map((commit) => (
                <li key={commit.hash} className="instance-row">
                  <div
                    className={`instance-row-main history-row-main${previewRef === commit.hash ? ' is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Preview version from ${formatCommitDate(commit.date)}`}
                    onClick={() => onSelectRevision(commit.hash)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectRevision(commit.hash);
                      }
                    }}
                  >
                    <div className="history-row-text">
                      <strong>{formatCommitDate(commit.date)}</strong>
                      <span className="history-row-message">
                        {commit.message}
                        {commit.isCheckpoint && ' (checkpoint)'}
                      </span>
                      <span className="history-row-meta">
                        {commit.author.name} · {shortHash(commit.hash)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="history-row-restore"
                      disabled={actionBusy}
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirmingRestore(commit);
                      }}
                    >
                      Restore
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {hasMore && (
            <button type="button" onClick={() => setLimit((current) => current + LOAD_MORE_STEP)}>
              Load older commits
            </button>
          )}

          {actionError && <p role="alert">{actionError}</p>}
        </>
      )}

      {confirmingRestore && (
        <ConfirmDialog
          message={buildRestoreMessage(confirmingRestore.date)}
          confirmLabel="Restore"
          busy={actionBusy}
          onConfirm={() => void handleConfirmRestore()}
          onCancel={() => setConfirmingRestore(null)}
        />
      )}
    </div>
  );
}
