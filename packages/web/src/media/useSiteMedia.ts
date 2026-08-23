import { useCallback, useEffect, useState } from 'react';
import { listSiteMedia, type MediaItem } from '../api/site-media.ts';
import { toLoadError, type LoadError } from '../sites/site-load-error.ts';

export interface UseSiteMediaResult {
  items: MediaItem[];
  loading: boolean;
  loadError: LoadError | null;
  maxUploadBytes: number | null;
  refresh: () => void;
}

// Mounted independently in both MediaLibraryPage (full page) and
// MediaPickerModal (picker mode of the same MediaLibrary) - each gets
// its own copy rather than lifting this to a shared cache, matching
// useThemeSchemas's own precedent for the identical situation.
export function useSiteMedia(siteId: string): UseSiteMediaResult {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [maxUploadBytes, setMaxUploadBytes] = useState<number | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    listSiteMedia(siteId)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setMaxUploadBytes(result.maxUploadBytes);
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

  // Simplest correct option for now: re-run the fetch rather than
  // editing the local list optimistically - no real evidence yet that
  // a media library needs anything faster, matching the same
  // "ship the plain version, revisit if it's ever actually slow" call
  // already made agent-side for thumbnails.
  const refresh = useCallback(() => {
    setRefreshCount((count) => count + 1);
  }, []);

  return { items, loading, loadError, maxUploadBytes, refresh };
}
