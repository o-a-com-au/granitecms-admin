import { useCallback, useEffect, useState } from 'react';
import { listSiteMedia, type MediaItem } from '../api/site-media.ts';

export interface UseSiteMediaResult {
  items: MediaItem[];
  loadError: string | null;
  maxUploadBytes: number | null;
  refresh: () => void;
}

// Mounted independently in both MediaLibraryPage (full page) and
// MediaPickerModal (picker mode of the same MediaLibrary) - each gets
// its own copy rather than lifting this to a shared cache, matching
// useThemeSchemas's own precedent for the identical situation.
export function useSiteMedia(siteId: string): UseSiteMediaResult {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [maxUploadBytes, setMaxUploadBytes] = useState<number | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    listSiteMedia(siteId)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setMaxUploadBytes(result.maxUploadBytes);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load media');
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

  return { items, loadError, maxUploadBytes, refresh };
}
