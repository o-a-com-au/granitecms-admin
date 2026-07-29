import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { fetchPageHistory, fetchPageRevision, revertPageToRevision, type HistoryCommit } from '../api/site-history.ts';
import { PageDiffView } from '../history/PageDiffView.tsx';
import { BackToRegistryLink } from '../layout/BackToRegistryLink.tsx';

const DEFAULT_LIMIT = 100;
const LOAD_MORE_STEP = 100;

interface DiffState {
  fromLabel: string;
  toLabel: string;
  fromContent: string;
  toContent: string;
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

// H1-H4: a page's real git history - list, hide-by-default checkpoint
// commits, diff two revisions (or one against "current"), and
// one-click revert. Everything here reads/writes through the same
// admin proxy routes as the rest of this app; nothing talks to the
// site directly.
export function PageHistoryPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [searchParams] = useSearchParams();
  const path = searchParams.get('path') ?? '';
  const previewUrl = searchParams.get('url');

  const [commits, setCommits] = useState<HistoryCommit[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [selectedHashes, setSelectedHashes] = useState<string[]>([]);
  const [diff, setDiff] = useState<DiffState | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

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

  function toggleSelected(hash: string): void {
    setSelectedHashes((current) => {
      if (current.includes(hash)) {
        return current.filter((h) => h !== hash);
      }
      // H3: a third checkbox click while two are already selected is
      // a no-op, not a queue - the user must deselect one first.
      if (current.length >= 2) {
        return current;
      }
      return [...current, hash];
    });
  }

  async function handleCompare(): Promise<void> {
    if (!commits || selectedHashes.length === 0) {
      return;
    }
    setDiffError(null);
    setDiff(null);

    let fromRef: string;
    let toRef: string;
    let fromLabel: string;
    let toLabel: string;

    if (selectedHashes.length === 1) {
      fromRef = selectedHashes[0]!;
      toRef = 'HEAD';
      fromLabel = shortHash(fromRef);
      toLabel = 'Current';
    } else {
      // H3: ordered by position in the (newest-first) commit array,
      // not click order, so the diff is always older-on-left/
      // newer-on-right regardless of which was clicked first.
      const [a, b] = selectedHashes as [string, string];
      const indexA = commits.findIndex((c) => c.hash === a);
      const indexB = commits.findIndex((c) => c.hash === b);
      const olderRef = indexA > indexB ? a : b;
      const newerRef = indexA > indexB ? b : a;
      fromRef = olderRef;
      toRef = newerRef;
      fromLabel = shortHash(fromRef);
      toLabel = shortHash(toRef);
    }

    try {
      const [fromContent, toContent] = await Promise.all([
        fetchPageRevision(siteId, fromRef, path),
        fetchPageRevision(siteId, toRef, path),
      ]);
      setDiff({ fromLabel, toLabel, fromContent, toContent });
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Failed to load one of these revisions');
    }
  }

  async function handleRevert(hash: string): Promise<void> {
    if (!window.confirm('Revert the live page to this version? This creates a new commit and cannot be undone.')) {
      return;
    }
    const message = window.prompt('Describe this revert for the history:');
    if (message === null) {
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      setActionError('A commit message is required to revert.');
      return;
    }

    setActionBusy(true);
    setActionError(null);
    try {
      await revertPageToRevision(siteId, hash, path, trimmed);
      const result = await fetchPageHistory(siteId, path, limit);
      setCommits(result.commits);
      setHasMore(result.hasMore);
      setDiff(null);
      setSelectedHashes([]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to revert');
    } finally {
      setActionBusy(false);
    }
  }

  const visibleCommits = commits?.filter((commit) => showCheckpoints || !commit.isCheckpoint) ?? null;

  return (
    <main>
      <BackToRegistryLink />
      <h1>History</h1>
      <p>
        Site: <code>{siteId}</code> Path: <code>{path}</code>
      </p>
      <p>
        <Link
          to={`/sites/${siteId}/editor?path=${encodeURIComponent(path)}${previewUrl ? `&url=${encodeURIComponent(previewUrl)}` : ''}`}
        >
          Back to editor
        </Link>
      </p>
      <p>Reverting only affects the published version - an open draft on this page is unaffected.</p>

      {loadError && <p role="alert">{loadError}</p>}

      {!loadError && commits === null && <p>Loading...</p>}

      {!loadError && commits !== null && (
        <>
          <label>
            <input
              type="checkbox"
              checked={showCheckpoints}
              onChange={(event) => setShowCheckpoints(event.target.checked)}
            />
            Show checkpoint commits
          </label>

          {visibleCommits?.length === 0 && <p>No commits to show.</p>}

          {visibleCommits && visibleCommits.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Compare</th>
                  <th>Message</th>
                  <th>Author</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCommits.map((commit) => (
                  <tr key={commit.hash}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedHashes.includes(commit.hash)}
                        onChange={() => toggleSelected(commit.hash)}
                        aria-label={`Select ${shortHash(commit.hash)} for comparison`}
                      />
                    </td>
                    <td>
                      {commit.message}
                      {commit.isCheckpoint && ' (checkpoint)'}
                    </td>
                    <td>{commit.author.name}</td>
                    <td>{commit.date}</td>
                    <td>
                      <button type="button" onClick={() => void handleRevert(commit.hash)} disabled={actionBusy}>
                        Revert to this version
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {hasMore && (
            <button type="button" onClick={() => setLimit((current) => current + LOAD_MORE_STEP)}>
              Load older commits
            </button>
          )}

          <button type="button" onClick={() => void handleCompare()} disabled={selectedHashes.length === 0}>
            Compare
          </button>
          {actionError && <p role="alert">{actionError}</p>}
          {diffError && <p role="alert">{diffError}</p>}
          {diff && (
            <PageDiffView
              fromLabel={diff.fromLabel}
              toLabel={diff.toLabel}
              fromContent={diff.fromContent}
              toContent={diff.toContent}
            />
          )}
        </>
      )}
    </main>
  );
}
