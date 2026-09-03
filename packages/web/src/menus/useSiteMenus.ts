import { useCallback, useEffect, useState } from 'react';
import { listSiteMenus, type SiteMenu } from '../api/site-menus.ts';
import { toLoadError, type LoadError } from '../sites/site-load-error.ts';

export interface UseSiteMenusResult {
  menus: SiteMenu[];
  loading: boolean;
  loadError: LoadError | null;
  refresh: () => void;
}

// Mirrors useSiteRedirects.ts exactly - refresh() always refetches
// everything fresh (names, items, and etags for every menu) rather
// than patching local state after a save, so there is never a stale
// etag lying around to accidentally reuse for a second edit.
export function useSiteMenus(siteId: string): UseSiteMenusResult {
  const [menus, setMenus] = useState<SiteMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    listSiteMenus(siteId)
      .then((result) => {
        if (!cancelled) {
          setMenus(result);
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

  return { menus, loading, loadError, refresh };
}
