import { useCallback, useEffect, useState } from 'react';
import { listSiteRedirects, type RedirectEntry } from '../api/site-redirects.ts';
import { toLoadError, type LoadError } from '../sites/site-load-error.ts';

export interface UseSiteRedirectsResult {
  entries: RedirectEntry[];
  loading: boolean;
  loadError: LoadError | null;
  refresh: () => void;
}

export function useSiteRedirects(siteId: string): UseSiteRedirectsResult {
  const [entries, setEntries] = useState<RedirectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    listSiteRedirects(siteId)
      .then((result) => {
        if (!cancelled) {
          setEntries(result.entries);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(toLoadError(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, refreshCount]);

  const refresh = useCallback(() => {
    setRefreshCount((count) => count + 1);
  }, []);

  return { entries, loading, loadError, refresh };
}
