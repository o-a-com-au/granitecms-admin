// Remembers "which site was I last on" and "what was I last editing
// there", entirely client-side (localStorage) - this admin has no
// server-side concept of a current site, every route gets siteId
// purely from the URL. Read/write pairs are wrapped in try/catch,
// mirroring ThemeContext.ts's own guarded pattern: real browsers can
// throw on localStorage access (Safari private mode etc), and this is
// a convenience, not authoritative state, so a blocked/unavailable
// store degrades to "nothing remembered" rather than a crash.

const LAST_SITE_KEY = 'cms-admin-last-site';
const LAST_EDITOR_LOCATION_KEY = 'cms-admin-last-editor-location';

export function readLastSiteId(): string | null {
  try {
    return localStorage.getItem(LAST_SITE_KEY);
  } catch {
    return null;
  }
}

export function writeLastSiteId(siteId: string): void {
  try {
    localStorage.setItem(LAST_SITE_KEY, siteId);
  } catch {
    // See the module comment above - unavailable/blocked storage is
    // expected, not an error worth surfacing.
  }
}

type EditorLocationsBySite = Record<string, string>;

function readEditorLocationsMap(): EditorLocationsBySite {
  try {
    const raw = localStorage.getItem(LAST_EDITOR_LOCATION_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as EditorLocationsBySite) : {};
  } catch {
    return {};
  }
}

// One JSON object keyed by siteId under a single localStorage key, not
// one key per site - siteIds aren't known ahead of time, and this
// keeps cleanup/inspection to one place.
export function readLastEditorLocation(siteId: string): string | null {
  return readEditorLocationsMap()[siteId] ?? null;
}

export function writeLastEditorLocation(siteId: string, pathAndSearch: string): void {
  try {
    const map = readEditorLocationsMap();
    map[siteId] = pathAndSearch;
    localStorage.setItem(LAST_EDITOR_LOCATION_KEY, JSON.stringify(map));
  } catch {
    // See writeLastSiteId above.
  }
}

// The CMS's own idiomatic homepage address - a site's root URL "/"
// maps to pages/index.json (confirmed via the agent repo's own E1
// test) - used as the last-resort default when a site has no
// remembered editor location yet. Built via URLSearchParams, not a
// hand-written percent-encoded literal, so the encoding can't drift
// from what the rest of the app produces (PageEditorPage.tsx's own
// handleRenamed/navigateToPage do the same).
export function defaultEditorHref(siteId: string): string {
  const params = new URLSearchParams({ path: 'pages/index.json', url: '/' });
  return `/sites/${siteId}/editor?${params.toString()}`;
}

export function resolveEditorHref(siteId: string): string {
  return readLastEditorLocation(siteId) ?? defaultEditorHref(siteId);
}

// Pulls just the "url" query param back out of a stored editor location
// (see readLastEditorLocation above) - the persistent preview viewport
// (PreviewContext.tsx) and PagesHubPage both need "what page was last
// open" but only care about its previewable URL, not the full editor
// route.
export function readLastPreviewUrl(siteId: string): string | null {
  const pathAndSearch = readLastEditorLocation(siteId);
  const queryIndex = pathAndSearch?.indexOf('?') ?? -1;
  if (pathAndSearch === null || queryIndex === -1) {
    return null;
  }
  return new URLSearchParams(pathAndSearch.slice(queryIndex)).get('url');
}
