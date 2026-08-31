import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listSiteContent, SiteContentError } from '../api/site-content.ts';
import type { ContentListEntry } from '../api/site-content.ts';
import { isMenuPath } from './deriveMenuName.ts';
import { buildPageTree, flattenVisibleTree, type PageTreeNode } from './pageTree.ts';
import { NewPageModal } from './NewPageModal.tsx';
import { AddIcon } from '../sections/AddIcon.tsx';
import { SiteStatusPanel } from '../site-status/SiteStatusPanel.tsx';
import { TopLoadingBar } from '../site-status/TopLoadingBar.tsx';
import { buildLoadErrorActions, loadErrorMessage, type LoadError } from '../sites/site-load-error.ts';

// Just enough of a ContentListEntry for PagesHubPage to build an editor
// href from - path and url travel together so the same page can be
// remembered as "the current one" (currentSite.ts's shared editor
// location record), not just previewed here with no way back to it.
export interface PreviewablePage {
  path: string;
  url: string;
}

export interface PagesTabPanelProps {
  siteId: string;
  onPreview: (page: PreviewablePage | null) => void;
}

// A plain "eye" glyph for the row-level Preview affordance - same
// "generic currentColor utility icon" convention as AppShell.tsx's own
// ExternalLinkIcon/GlobeIcon, not one of icons/index.tsx's dedicated,
// fixed-palette design icons.
function PreviewIcon() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function collectParentPaths(nodes: PageTreeNode[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.children.length > 0) {
      into.add(node.entry.path);
      collectParentPaths(node.children, into);
    }
  }
}

function matchesSearch(entry: ContentListEntry, query: string): boolean {
  if (query.trim() === '') {
    return true;
  }
  const needle = query.trim().toLowerCase();
  return entry.name.toLowerCase().includes(needle) || entry.title.toLowerCase().includes(needle) || entry.path.toLowerCase().includes(needle);
}


export function PagesTabPanel({ siteId, onPreview }: PagesTabPanelProps) {
  const [search, setSearch] = useState('');
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [newPageModalOpen, setNewPageModalOpen] = useState(false);
  const [entries, setEntries] = useState<ContentListEntry[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const retry = useCallback(() => setReloadToken((count) => count + 1), []);

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
  }, [siteId, reloadToken]);

  useEffect(() => {
    if (entries === null) {
      return;
    }
    const allPages = entries.filter((entry) => !isMenuPath(entry.path));
    const parentPaths = new Set<string>();
    collectParentPaths(buildPageTree(allPages), parentPaths);
    setCollapsedPaths(parentPaths);
  }, [entries]);

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

  const pages = entries?.filter((entry) => !isMenuPath(entry.path)).filter((entry) => matchesSearch(entry, search)) ?? null;
  const rows = pages !== null ? flattenVisibleTree(buildPageTree(pages), collapsedPaths) : null;

  if (error) {
    return <SiteStatusPanel variant="problem" message={loadErrorMessage(error)} actions={buildLoadErrorActions(error, siteId, retry)} />;
  }

  if (entries === null) {
    return <TopLoadingBar active />;
  }

  return (
    <div className="pages-hub-tab">
      <input
        type="search"
        className="content-search"
        placeholder="Search pages"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {rows !== null && rows.length === 0 ? (
        <p>No pages found.</p>
      ) : (
        <ul className="instance-list">
          {rows?.map(({ node, depth }) => (
            <PagesHubTreeRow
              key={node.entry.path}
              siteId={siteId}
              node={node}
              depth={depth}
              collapsed={collapsedPaths.has(node.entry.path)}
              onToggle={handleToggle}
              onPreview={onPreview}
            />
          ))}
        </ul>
      )}
      <button type="button" className="instance-add-button" onClick={() => setNewPageModalOpen(true)}>
        <AddIcon />
        Add Page
      </button>
      {newPageModalOpen && <NewPageModal siteId={siteId} onClose={() => setNewPageModalOpen(false)} />}
    </div>
  );
}

interface PagesHubTreeRowProps {
  siteId: string;
  node: PageTreeNode;
  depth: number;
  collapsed: boolean;
  onToggle: (path: string) => void;
  onPreview: (page: PreviewablePage | null) => void;
}

// The real row (PageTreeRow above is dead scaffolding - kept out of the
// exported surface, removed once this settles).
function PagesHubTreeRow({ siteId, node, depth, collapsed, onToggle, onPreview }: PagesHubTreeRowProps) {
  const { entry } = node;
  const hasChildren = node.children.length > 0;
  const editorHref = `/sites/${siteId}/editor?path=${encodeURIComponent(entry.path)}${
    entry.url !== null ? `&url=${encodeURIComponent(entry.url)}` : ''
  }`;

  return (
    <li className="instance-row">
      <div className="instance-row-main">
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
          <Link to={editorHref} state={{ hasDraft: entry.hasDraft, published: entry.published }}>
            {entry.name || entry.path}
          </Link>
        </span>
        {entry.url !== null && (
          <button
            type="button"
            className="instance-row-remove pages-hub-preview-button"
            aria-label={`Preview ${entry.name || entry.path}`}
            onClick={() => onPreview(entry.url !== null ? { path: entry.path, url: entry.url } : null)}
          >
            <PreviewIcon />
          </button>
        )}
      </div>
    </li>
  );
}
