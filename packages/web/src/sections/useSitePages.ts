import { useEffect, useState } from 'react';
import { listSiteContent, type ContentListEntry } from '../api/site-content.ts';

export interface SitePage {
  title: string;
  url: string;
  published: boolean;
}

// The site's pages, for LinkInput's suggestions and its "links to" line.
// A form can hold several link fields, so one fetch is shared between
// them for a short while rather than each asking again; after that it's
// fetched fresh, so a page made a minute ago is offered. null while
// loading, or when the list can't be had - suggestions are a help, never
// a requirement, so a failure just means none.
const FRESH_MS = 30_000;
const cache = new Map<string, { at: number; pages: Promise<SitePage[] | null> }>();

function toPages(entries: ContentListEntry[]): SitePage[] {
  return entries
    .filter((entry): entry is ContentListEntry & { url: string } => entry.url !== null)
    .map((entry) => ({ title: entry.title || entry.name || entry.url, url: entry.url, published: entry.published }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

function loadPages(siteId: string): Promise<SitePage[] | null> {
  const cached = cache.get(siteId);
  if (cached && Date.now() - cached.at < FRESH_MS) {
    return cached.pages;
  }
  const pages = listSiteContent(siteId, {}).then(toPages, () => null);
  cache.set(siteId, { at: Date.now(), pages });
  return pages;
}

export function useSitePages(siteId: string): SitePage[] | null {
  const [pages, setPages] = useState<SitePage[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadPages(siteId).then((loaded) => {
      if (!cancelled) {
        setPages(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [siteId]);
  return pages;
}

// For tests: forget what's been fetched.
export function clearSitePagesCache(): void {
  cache.clear();
}
