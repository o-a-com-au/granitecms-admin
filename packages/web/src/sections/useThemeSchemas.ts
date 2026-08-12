import { useEffect, useState } from 'react';
import { fetchSiteThemeSchemas, type ThemeSchemas } from '../api/site-theme-schemas.ts';

export interface UseThemeSchemasResult {
  themeSchemas: ThemeSchemas | null;
  loadError: string | null;
}

// Shared by PageSectionsEditor (the Sections list, left) and
// SectionFieldsPanel (the Fields form, right) - the revised layout
// (docs/designs/Revised-Page-Edit--Section-Edit.png) shows both
// mounted at once, each independently fetching its own copy rather
// than one being lifted to thread themeSchemas down as a prop - the
// payload is small and this keeps each panel self-sufficient, exactly
// as PageSectionsEditor already was before this split.
export function useThemeSchemas(siteId: string): UseThemeSchemasResult {
  const [themeSchemas, setThemeSchemas] = useState<ThemeSchemas | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setThemeSchemas(null);
    setLoadError(null);

    fetchSiteThemeSchemas(siteId)
      .then((schemas) => {
        if (!cancelled) {
          setThemeSchemas(schemas);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load the theme schemas');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return { themeSchemas, loadError };
}
