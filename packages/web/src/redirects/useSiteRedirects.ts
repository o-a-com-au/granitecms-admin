import { useCallback, useEffect, useState } from 'react';
import { listSiteRedirects, type RedirectEntry } from '../api/site-redirects.ts';

export interface UseSiteRedirectsResult {
  entries: RedirectEntry[];
  loadError: string | null;
  refresh: () => void;
}

export function useSiteRedirects(siteId: string): UseSiteRedirectsResult {
  const [entries, setEntries] = useState<RedirectEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    listSiteRedirects(siteId)
      .then((result) => {
        if (!cancelled) {
          setEntries(result.entries);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load redirects');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, refreshCount]);

  const refresh = useCallback(() => {
    setRefreshCount((count) => count + 1);
  }, []);

  return { entries, loadError, refresh };
}
