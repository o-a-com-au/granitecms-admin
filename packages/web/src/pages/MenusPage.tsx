import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { listSiteContent, SiteContentError } from '../api/site-content.ts';
import { readSiteEditorContent } from '../api/site-editor.ts';
import { deriveMenuName, isMenuPath } from './deriveMenuName.ts';

interface MenuRow {
  path: string;
  name: string;
  items: string[];
}

interface LoadError {
  reason: 'unreachable' | 'unauthorized' | 'error';
  message: string;
}

function isMenuItemArray(value: unknown): value is Array<{ label: string }> {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null && typeof (item as { label?: unknown }).label === 'string')
  );
}

// menu.schema.json is {schemaVersion, items: [{label, url}]} -
// confirmed directly against the agent repo's own schema. A menu with
// no items, or content that doesn't parse as expected, degrades to an
// empty list rather than throwing - a single malformed menu shouldn't
// blank the rest of the page.
function extractMenuItemLabels(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return [];
    }
    const items = (parsed as { items?: unknown }).items;
    return isMenuItemArray(items) ? items.map((item) => item.label) : [];
  } catch {
    return [];
  }
}

export function MenusPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [menus, setMenus] = useState<MenuRow[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMenus(null);
    setError(null);

    listSiteContent(siteId, {})
      .then(async (entries) => {
        const menuEntries = entries.filter((entry) => isMenuPath(entry.path));
        const rows = await Promise.all(
          menuEntries.map(async (entry): Promise<MenuRow> => {
            try {
              const { content } = await readSiteEditorContent(siteId, entry.path);
              return { path: entry.path, name: deriveMenuName(entry.path), items: extractMenuItemLabels(content) };
            } catch {
              // One menu's own content failing to load degrades to an
              // empty item preview for that row, not a page-level error -
              // the menu still exists and is still worth listing.
              return { path: entry.path, name: deriveMenuName(entry.path), items: [] };
            }
          }),
        );
        if (!cancelled) {
          setMenus(rows);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        if (err instanceof SiteContentError) {
          setError({ reason: err.reason, message: err.message });
        } else {
          setError({ reason: 'error', message: err instanceof Error ? err.message : 'Failed to load menus' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return (
    <div className="list-page">
      <div className="list-page-inner">
        <h1>Menus</h1>

        {error && (
          <p role="alert">
            {error.reason === 'unreachable' && 'This site is unreachable right now.'}
            {error.reason === 'unauthorized' && (
              <>
                This site&apos;s token was rejected. <Link to="/">Rotate it from the registry</Link>.
              </>
            )}
            {error.reason === 'error' && error.message}
          </p>
        )}

        {!error && menus === null && <p>Loading...</p>}
        {!error && menus !== null && menus.length === 0 && <p>No menus found.</p>}
        {!error && menus !== null && menus.length > 0 && (
            <table className="list-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Menu items</th>
                </tr>
              </thead>
              <tbody>
                {menus.map((menu) => (
                  <tr key={menu.path}>
                    <td>
                      <Link to={`/sites/${siteId}/menus/edit?path=${encodeURIComponent(menu.path)}`}>{menu.name}</Link>
                    </td>
                    <td>{menu.items.length > 0 ? menu.items.join(', ') : 'No items'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </div>
    </div>
  );
}
