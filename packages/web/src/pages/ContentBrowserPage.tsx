import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { listSiteContent, SiteContentError } from '../api/site-content.ts';
import type { ContentListEntry } from '../api/site-content.ts';
import { isMenuPath } from './deriveMenuName.ts';
import { formatChangedAt } from './formatChangedAt.ts';
import { buildPageTree, flattenVisibleTree, type PageTreeNode } from './pageTree.ts';

type StatusFilter = 'all' | 'live' | 'unpublished';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All Pages' },
  { value: 'live', label: 'Published' },
  { value: 'unpublished', label: 'Unpublished' },
];

function isStatusFilter(value: string | null): value is StatusFilter {
  return value === 'all' || value === 'live' || value === 'unpublished';
}

// Kept as its own richer 4-state label (Group D's own precedent, incl.
// the honest "Live + draft pending" distinction) rather than
// collapsing to the mockup's plain Published/Unpublished - the status
// *filter* tabs use the simpler two-way published split, but the
// status *column* stays as informative as it already was.
function statusLabel(entry: ContentListEntry): string {
  if (entry.published && entry.hasDraft) {
    return 'Live + draft pending';
  }
  if (entry.published) {
    return 'Live';
  }
  if (entry.hasDraft) {
    return 'Draft only';
  }
  return 'Unknown';
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0]?.toUpperCase() + value.slice(1) : value;
}

function entryHref(siteId: string, entry: ContentListEntry): string {
  return `/sites/${siteId}/editor?path=${encodeURIComponent(entry.path)}${
    entry.url !== null ? `&url=${encodeURIComponent(entry.url)}` : ''
  }`;
}

function matchesSearch(entry: ContentListEntry, query: string): boolean {
  if (query.trim() === '') {
    return true;
  }
  const needle = query.trim().toLowerCase();
  return (
    entry.name.toLowerCase().includes(needle) ||
    entry.title.toLowerCase().includes(needle) ||
    entry.path.toLowerCase().includes(needle)
  );
}

interface LoadError {
  reason: 'unreachable' | 'unauthorized' | 'error';
  message: string;
}

interface PageTreeRowProps {
  siteId: string;
  node: PageTreeNode;
  depth: number;
  collapsed: boolean;
  onToggle: (path: string) => void;
}

// A single row of the tree - the expand chevron only renders at all
// when the page actually has children (docs/design/Pages.png shows no
// chevron placeholder on leaf rows), indented by 1.5rem per depth
// level so nesting reads visually without a vertical guide line.
function PageTreeRow({ siteId, node, depth, collapsed, onToggle }: PageTreeRowProps) {
  const { entry } = node;
  const hasChildren = node.children.length > 0;

  return (
    <tr>
      <td>
        <span className="page-tree-cell" style={{ paddingLeft: `${depth * 1.5}rem` }}>
          {hasChildren ? (
            <button
              type="button"
              className="page-tree-toggle"
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${entry.name || entry.path}` : `Collapse ${entry.name || entry.path}`}
              onClick={() => onToggle(entry.path)}
            >
              {collapsed ? '›' : '⌄'}
            </button>
          ) : (
            <span className="page-tree-toggle-spacer" aria-hidden="true" />
          )}
          <Link to={entryHref(siteId, entry)} state={{ hasDraft: entry.hasDraft, published: entry.published }}>
            {entry.name || entry.path}
          </Link>
        </span>
      </td>
      <td>{capitalize(entry.type) || 'Unknown'}</td>
      <td>{statusLabel(entry)}</td>
      <td>{formatChangedAt(entry.changedAt)}</td>
    </tr>
  );
}

// docs/design/Pages.png - search box + All Pages/Published/Unpublished
// filter tabs + a borderless, expandable Name/Type/Status/Changed
// tree, replacing the old bare Type-text-input/draft-status-dropdown
// form and flat list. Search and the status tabs both run client-side
// against the one unfiltered fetch (menus already have to be excluded
// client-side here regardless - see isMenuPath below - so there was no
// server round-trip being saved by keeping server-side query params
// for the rest). The tree itself is derived from each page's own
// nested path (pages/about/team.json is a child of pages/about.json)
// - see pageTree.ts - not a separate parent-id field nothing in the
// content model has.
export function ContentBrowserPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const status: StatusFilter = isStatusFilter(statusParam) ? statusParam : 'all';
  const [search, setSearch] = useState('');
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const [entries, setEntries] = useState<ContentListEntry[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);

  // Always a fresh, live call - never gated on a cached SiteStatus
  // from the registry page, matching Group C's own "live status on
  // every request" principle. A site can go unreachable/unauthorized
  // between registration and browsing here.
  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);

    listSiteContent(siteId, {})
      .then((result) => {
        if (!cancelled) {
          setEntries(result);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        if (err instanceof SiteContentError) {
          setError({ reason: err.reason, message: err.message });
        } else {
          setError({ reason: 'error', message: err instanceof Error ? err.message : 'Failed to load content' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  function handleStatusChange(value: StatusFilter): void {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete('status');
    } else {
      next.set('status', value);
    }
    setSearchParams(next);
  }

  function handleToggle(path: string): void {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  // Menus are excluded here, not merely filtered by default - they're
  // edited inside the Menus section (left nav's own icon), never by
  // routing into this page's editor, which assumes a page-shaped
  // document (sections/blocks/metafields/preview - all meaningless for
  // a menu). isMenuPath is the same path-prefix signal MenusPage.tsx
  // already established, not a second one.
  const pages =
    entries
      ?.filter((entry) => !isMenuPath(entry.path))
      .filter((entry) => status === 'all' || (status === 'live') === entry.published)
      .filter((entry) => matchesSearch(entry, search)) ?? null;

  const rows = pages !== null ? flattenVisibleTree(buildPageTree(pages), collapsedPaths) : null;

  return (
    <div>
      <h1>Browse Pages</h1>

      <div className="content-toolbar">
        <input
          type="search"
          className="content-search"
          placeholder="Search Pages"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="filter-tabs" role="group" aria-label="Filter pages">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => handleStatusChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

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

      {!error && entries === null && <p>Loading...</p>}

      {!error && rows !== null && (
        <>
          {rows.length === 0 ? (
            <p>No pages found.</p>
          ) : (
            <table className="list-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Changed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ node, depth }) => (
                  <PageTreeRow
                    key={node.entry.path}
                    siteId={siteId}
                    node={node}
                    depth={depth}
                    collapsed={collapsedPaths.has(node.entry.path)}
                    onToggle={handleToggle}
                  />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
