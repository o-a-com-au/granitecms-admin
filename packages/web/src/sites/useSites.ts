import { useCallback, useEffect, useState } from 'react';
import { listSites } from '../api/sites.ts';
import type { SiteListEntry } from '../api/sites.ts';

interface UseSitesResult {
  sites: SiteListEntry[] | null;
  error: string | null;
  refresh: () => Promise<void>;
}

// Every mutation (add/rotate/delete) calls refresh() afterward rather
// than patching local state optimistically - status is server-
// computed and live, so a local patch would show stale/wrong status
// right after a rotate.
export function useSites(): UseSitesResult {
  const [sites, setSites] = useState<SiteListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listSites();
      setSites(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load websites');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    listSites()
      .then((result) => {
        if (!cancelled) {
          setSites(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load websites');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { sites, error, refresh };
}
