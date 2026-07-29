import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { listSiteContent, SiteContentError } from '../api/site-content.ts';
import type { ContentListEntry } from '../api/site-content.ts';
import { BackToRegistryLink } from '../layout/BackToRegistryLink.tsx';

function statusLabel(entry: ContentListEntry): string {
  if (entry.published && entry.hasDraft) {
    return 'Live + draft pending';
  }
  if (entry.published) {
    return 'Live';
  }
  if (entry.hasDraft) {
    return 'Draft only';
  }
  return 'Unknown';
}

interface LoadError {
  reason: 'unreachable' | 'unauthorized' | 'error';
  message: string;
}

export function ContentBrowserPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = searchParams.get('type') ?? '';
  const draftStatusParam = searchParams.get('draftStatus') ?? '';
  const draftStatus = draftStatusParam === 'has-draft' || draftStatusParam === 'no-draft' ? draftStatusParam : '';

  const [entries, setEntries] = useState<ContentListEntry[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);

  // Always a fresh, live call - never gated on a cached SiteStatus
  // from the registry page, matching Group C's own "live status on
  // every request" principle. A site can go unreachable/unauthorized
  // between registration and browsing here.
  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);

    listSiteContent(siteId, { type: type || undefined, draftStatus: draftStatus || undefined })
      .then((result) => {
        if (!cancelled) {
          setEntries(result);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        if (err instanceof SiteContentError) {
          setError({ reason: err.reason, message: err.message });
        } else {
          setError({ reason: 'error', message: err instanceof Error ? err.message : 'Failed to load content' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, type, draftStatus]);

  function handleTypeChange(value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('type', value);
    } else {
      next.delete('type');
    }
    setSearchParams(next);
  }

  function handleDraftStatusChange(value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('draftStatus', value);
    } else {
      next.delete('draftStatus');
    }
    setSearchParams(next);
  }

  return (
    <main>
      <BackToRegistryLink />
      <h1>Content</h1>

      <form>
        <label>
          Type
          <input value={type} onChange={(event) => handleTypeChange(event.target.value)} placeholder="page" />
        </label>
        <label>
          Draft status
          <select value={draftStatus} onChange={(event) => handleDraftStatusChange(event.target.value)}>
            <option value="">All</option>
            <option value="has-draft">Has draft</option>
            <option value="no-draft">No draft</option>
          </select>
        </label>
      </form>

      {error && (
        <p role="alert">
          {error.reason === 'unreachable' && 'This site is unreachable right now.'}
          {error.reason === 'unauthorized' && (
            <>
              This site&apos;s token was rejected. <Link to="/">Rotate it from the registry</Link>.
            </>
          )}
          {error.reason === 'error' && error.message}
        </p>
      )}

      {!error && entries === null && <p>Loading...</p>}
      {!error && entries !== null && entries.length === 0 && <p>No content found.</p>}
      {!error && entries !== null && entries.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Path</th>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.path}>
                <td>
                  <Link
                    to={`/sites/${siteId}/editor?path=${encodeURIComponent(entry.path)}`}
                    state={{ hasDraft: entry.hasDraft, published: entry.published }}
                  >
                    {entry.path}
                  </Link>
                </td>
                <td>{entry.title}</td>
                <td>{entry.type}</td>
                <td>{statusLabel(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
