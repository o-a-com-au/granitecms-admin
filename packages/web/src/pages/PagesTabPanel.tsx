import { useCallback, useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { listSiteContent, SiteContentError } from '../api/site-content.ts';
import type { ContentListEntry } from '../api/site-content.ts';
import { isMenuPath } from './deriveMenuName.ts';
import { buildPageTree, flattenVisibleTree, type PageTreeNode } from './pageTree.ts';
import { NewPageModal } from './NewPageModal.tsx';
import { AddIcon } from '../sections/AddIcon.tsx';
import { EditIcon } from '../sections/EditIcon.tsx';
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
  // Reports the deepest currently-EXPANDED level (0 = only root rows
  // visible, however many pages exist at that level) so PagesHubPage
  // can grow .pages-hub-panel to match - a nested page rendered the
  // same way BlockList nests blocks (real indentation via
  // .instance-list-nested, not a flat depth*padding-left) needs more
  // horizontal room the deeper it's expanded, same as a title
  // truncating less the more space its row actually has. Called with 0
  // on unmount (tab switched away, or this panel gone entirely) so the
  // extra width doesn't linger once nothing here still needs it.
  onMaxDepthChange?: (depth: number) => void;
}

function collectParentPaths(nodes: PageTreeNode[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.children.length > 0) {
      into.add(node.entry.path);
      collectParentPaths(node.children, into);
    }
  }
}

export function PagesTabPanel({ siteId, onPreview, onMaxDepthChange }: PagesTabPanelProps) {
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

  const pages = entries?.filter((entry) => !isMenuPath(entry.path)) ?? null;
  const tree = pages !== null ? buildPageTree(pages) : null;

  // flattenVisibleTree isn't used to render any more (the tree renders
  // itself recursively below, real nested <ul>s rather than a flat
  // depth-annotated array) - kept around purely to reuse its own
  // visible-rows walk for this one number, rather than writing a
  // second, easily-drifting depth-walker that has to agree with it on
  // exactly the same "collapsed hides children, not itself" rule.
  useEffect(() => {
    if (tree === null) {
      return;
    }
    const visibleRows = flattenVisibleTree(tree, collapsedPaths);
    const maxDepth = visibleRows.reduce((max, row) => Math.max(max, row.depth), 0);
    onMaxDepthChange?.(maxDepth);
  }, [entries, collapsedPaths]);

  useEffect(() => {
    return () => onMaxDepthChange?.(0);
  }, []);

  if (error) {
    return <SiteStatusPanel variant="problem" message={loadErrorMessage(error)} actions={buildLoadErrorActions(error, siteId, retry)} />;
  }

  if (entries === null) {
    return <TopLoadingBar active />;
  }

  return (
    <div className="pages-hub-tab">
      <h2 className="panel-heading">Pages</h2>
      {tree !== null && tree.length === 0 ? (
        <p>No pages found.</p>
      ) : (
        <ul className="instance-list">
          {tree?.map((node) => (
            <PagesHubTreeRow
              key={node.entry.path}
              siteId={siteId}
              node={node}
              collapsedPaths={collapsedPaths}
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
  collapsedPaths: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onPreview: (page: PreviewablePage | null) => void;
}

// The real row (PageTreeRow above is dead scaffolding - kept out of the
// exported surface, removed once this settles).
//
// Default click behaviour is now "just preview it" (load it into the
// shared viewport, staying right here on Pages hub), not "go straight
// to the editor" - direct request, so browsing pages and actually
// committing to edit one are two deliberately separate actions. The
// Edit button (pencil, was the eye/Preview icon) is the one that
// navigates. A page with no real url (nothing to preview) falls back
// to going straight to the editor on click, same as the button does -
// there's nothing useful a "preview" click could do there.
//
// Nests exactly the way BlockList.tsx's own BlockRow does now (matching
// the look of nested blocks under a section, requested directly): a
// row with children renders its own <ul className="instance-list
// instance-list-nested"> of child rows inside its own <li>, recursing
// into this same component rather than flattening the whole tree into
// one depth-annotated array first (pageTree.ts's flattenVisibleTree
// still exists, but only PagesTabPanel's own max-depth calculation
// uses it now - rendering itself is real recursion). The indentation
// comes entirely from that nested <ul>'s own margin/padding cascading
// one level per recursion, same as blocks - no per-row depth*padding-
// left inline style any more.
function PagesHubTreeRow({ siteId, node, collapsedPaths, onToggle, onPreview }: PagesHubTreeRowProps) {
  const navigate = useNavigate();
  const { entry } = node;
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedPaths.has(entry.path);
  const editorHref = `/sites/${siteId}/editor?path=${encodeURIComponent(entry.path)}${
    entry.url !== null ? `&url=${encodeURIComponent(entry.url)}` : ''
  }`;

  function handleTitleClick(): void {
    if (entry.url !== null) {
      onPreview({ path: entry.path, url: entry.url });
    } else {
      navigate(editorHref);
    }
  }

  function handleRowKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleTitleClick();
    }
  }

  function handleToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    onToggle(entry.path);
  }

  function handleEditLinkClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  return (
    <li className="instance-row">
      <div
        className="instance-row-main"
        role="button"
        tabIndex={0}
        aria-label={entry.name || entry.path}
        onClick={handleTitleClick}
        onKeyDown={handleRowKeyDown}
      >
        <span className="page-tree-cell">
          {hasChildren ? (
            <button
              type="button"
              className="page-tree-toggle"
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${entry.name || entry.path}` : `Collapse ${entry.name || entry.path}`}
              onClick={handleToggleClick}
            >
              {collapsed ? '›' : '⌄'}
            </button>
          ) : (
            <span className="page-tree-toggle-spacer" aria-hidden="true" />
          )}
          <span className="page-tree-title" title={entry.name || entry.path}>
            {entry.name || entry.path}
          </span>
        </span>
        <Link to={editorHref} className="instance-row-remove" aria-label={`Edit ${entry.name || entry.path}`} onClick={handleEditLinkClick}>
          <EditIcon />
        </Link>
      </div>
      {hasChildren && !collapsed && (
        <ul className="instance-list instance-list-nested">
          {node.children.map((child) => (
            <PagesHubTreeRow
              key={child.entry.path}
              siteId={siteId}
              node={child}
              collapsedPaths={collapsedPaths}
              onToggle={onToggle}
              onPreview={onPreview}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
