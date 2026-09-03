import { listSiteContent, SiteContentError } from './site-content.ts';
import { readSiteEditorContent, reasonFromResponse, encodePathSegments, SiteEditorError } from './site-editor.ts';

export interface MenuItem {
  label: string;
  url: string;
}

export interface SiteMenu {
  path: string;
  // Everything the envelope carries besides items (schemaVersion today,
  // possibly more later) - kept and round-tripped as-is on every save
  // rather than reconstructed, so a save can never silently downgrade
  // schemaVersion or drop a field this admin doesn't know about yet.
  envelope: Record<string, unknown>;
  items: MenuItem[];
  etag: string;
}

function isMenuPath(path: string): boolean {
  return path.startsWith('menus/');
}

// menu.schema.json is {schemaVersion, items: [{label, url}]},
// additionalProperties: false at both levels (confirmed against the
// agent repo's own schema) - a menu whose content doesn't parse as
// expected degrades to an empty envelope/item list rather than
// throwing, matching the former MenuEditorPage.tsx's own parseMenu
// precedent.
function parseMenu(content: string): { envelope: Record<string, unknown>; items: MenuItem[] } {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { envelope: {}, items: [] };
    }
    const envelope = parsed as Record<string, unknown>;
    const rawItems = envelope.items;
    const items: MenuItem[] = Array.isArray(rawItems)
      ? rawItems.map((item) => {
          const record = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
          return {
            label: typeof record.label === 'string' ? record.label : '',
            url: typeof record.url === 'string' ? record.url : '',
          };
        })
      : [];
    return { envelope, items };
  } catch {
    return { envelope: {}, items: [] };
  }
}

// listSiteContent's own type filter cannot find menus - entry.type is
// read from the content JSON's own "type" field, and a real menu file
// has none, so entry.type is always '' for every menu (isMenuPath's
// own path-prefix check is the only reliable signal, matching
// deriveMenuName.ts's precedent). Each menu's own content is then read
// individually (readSiteEditorContent, the same generic content-read
// route the old MenuEditorPage.tsx used) to get its items and etag -
// real sites are small (a handful of menus, not hundreds), so fetching
// them all in parallel on every open/refresh is simpler than inventing
// a bulk endpoint or a cache to invalidate.
export async function listSiteMenus(siteId: string): Promise<SiteMenu[]> {
  let entries;
  try {
    entries = await listSiteContent(siteId, {});
  } catch (err) {
    // listSiteContent throws a SiteContentError, a different class from
    // the SiteEditorError readSiteEditorContent throws below (and every
    // other site-scoped list fetch already throws) - normalised to the
    // latter here so a caller (useSiteMenus.ts's own toLoadError) only
    // ever has one exception type to narrow, matching every other list
    // hook in this app rather than inventing a menus-specific one.
    if (err instanceof SiteContentError) {
      throw new SiteEditorError(err.reason, err.message);
    }
    throw err;
  }
  const menuPaths = entries.filter((entry) => isMenuPath(entry.path)).map((entry) => entry.path);

  return Promise.all(
    menuPaths.map(async (path) => {
      const { content, etag } = await readSiteEditorContent(siteId, path);
      const { envelope, items } = parseMenu(content);
      return { path, envelope, items, etag };
    }),
  );
}

// PUT /api/sites/:id/menus/*path - the agent's own dedicated, no-draft
// menu-write endpoint (docs/cms-build-plan.md: "neither redirects nor
// menus has a meaningful preview-before-publish step"), not the
// generic drafts/publish flow the old MenuEditorPage.tsx used. Commits
// immediately, still If-Match/etag protected like a draft save - the
// returned etag must be used for the next save against this same menu.
export async function saveSiteMenuItems(
  siteId: string,
  path: string,
  envelope: Record<string, unknown>,
  items: MenuItem[],
  etag: string,
  message: string,
): Promise<string> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/menus/${encodePathSegments(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': etag },
    body: JSON.stringify({ content: { ...envelope, items }, message }),
  });

  if (response.status === 409) {
    throw await reasonFromResponse(response, 'conflict');
  }
  if (response.status === 428) {
    throw await reasonFromResponse(response, 'precondition-required');
  }
  if (response.status === 400) {
    throw await reasonFromResponse(response, 'invalid');
  }
  if (response.status === 404) {
    throw await reasonFromResponse(response, 'not-found');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }

  const newEtag = response.headers.get('etag');
  if (!newEtag) {
    throw new SiteEditorError('error', 'The website did not return a new ETag after saving');
  }
  return newEtag;
}
