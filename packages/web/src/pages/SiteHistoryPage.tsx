import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { fetchSiteWideHistory, type HistoryCommit } from '../api/site-history.ts';

const DEFAULT_LIMIT = 100;
const LOAD_MORE_STEP = 100;

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

// The top-nav History tab - a site-wide, browse-only activity feed
// (scoped server-side to path=content, so theme/vhost config commits
// don't show up alongside real content edits). Deliberately no diff/
// revert here, unlike PageHistoryPage.tsx: a per-commit revert needs a
// specific content path, which this list doesn't carry per entry -
// reverting a specific page stays on that page's own History
// (PageHistoryPage.tsx, unchanged), reached via HistoryPage.tsx's own
// ?path= dispatch.
export function SiteHistoryPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();

  const [commits, setCommits] = useState<HistoryCommit[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCheckpoints, setShowCheckpoints] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    fetchSiteWideHistory(siteId, limit)
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
  }, [siteId, limit]);

  const visibleCommits = commits?.filter((commit) => showCheckpoints || !commit.isCheckpoint) ?? null;

  return (
    <div className="list-page">
      <div className="list-page-inner">
        <h1>History</h1>

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
              <table className="list-table">
                <thead>
                  <tr>
                    <th>Message</th>
                    <th>Author</th>
                    <th>Date</th>
                    <th>Commit</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCommits.map((commit) => (
                    <tr key={commit.hash}>
                      <td>
                        {commit.message}
                        {commit.isCheckpoint && ' (checkpoint)'}
                      </td>
                      <td>{commit.author.name}</td>
                      <td>{commit.date}</td>
                      <td>
                        <code>{shortHash(commit.hash)}</code>
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
          </>
        )}
      </div>
    </div>
  );
}
