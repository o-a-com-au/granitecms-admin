import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { listSiteContent, deleteSitePage, SiteContentError } from '../api/site-content.ts';
import type { ContentListEntry } from '../api/site-content.ts';
import { moveSitePage, publishSiteDraft, publishSitePage, unpublishSitePage } from '../api/site-publishing.ts';
import { readSiteEditorContent, saveSiteDraft, siteContentHasLiveVersion, SiteEditorError } from '../api/site-editor.ts';
import { isMenuPath } from './deriveMenuName.ts';
import { buildPageTree, flattenVisibleTree, isSelfOrDescendantPage, pageParentPath, relativePagePath, type PageTreeNode } from './pageTree.ts';
import { NewPageModal } from './NewPageModal.tsx';
import {
  canDeletePage,
  canSetAsDraft,
  canChangePagePath,
  notFoundPageWarning,
  NON_PARENT_PAGE_PATHS,
} from './protectedPages.ts';
import { AddIcon } from '../sections/AddIcon.tsx';
import { DuplicateIcon } from '../sections/DuplicateIcon.tsx';
import { EditIcon } from '../sections/EditIcon.tsx';
import { TrashIcon } from '../sections/TrashIcon.tsx';
import { PublishIcon } from '../sections/PublishIcon.tsx';
import { DraftIcon } from '../sections/DraftIcon.tsx';
import { DragHandleIcon } from '../sections/DragHandleIcon.tsx';
import { AccordionArrowIcon } from '../sections/AccordionArrowIcon.tsx';
import { InstanceRowActions } from '../sections/InstanceRowActions.tsx';
import { ConfirmDialog } from '../editor/ConfirmDialog.tsx';
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
  // The url currently shown in the shared viewport (PreviewContext's
  // own previewUrl) - a row whose own entry.url matches gets the same
  // blue is-selected treatment Sections/Blocks already use for the
  // instance currently open in the Fields panel, so it's obvious at a
  // glance which page the viewport beside this list is actually
  // showing (requested directly). null matches nothing, same as no
  // page being previewed at all.
  activeUrl: string | null;
  // Bumped by PagesHubPage whenever something outside this panel
  // changes content - today, discarding or publishing the previewed
  // page's draft through the navigation guard. Without it a discard
  // that deletes a never-published page leaves its row sitting in this
  // tree until something else happens to reload, which reads as the
  // delete having silently failed.
  refreshToken?: number;
}

function collectParentPaths(nodes: PageTreeNode[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.children.length > 0) {
      into.add(node.entry.path);
      collectParentPaths(node.children, into);
    }
  }
}

// A move waiting on the user's own confirmation (drag-and-drop
// reparenting is a bigger, harder-to-eyeball-undo change than a normal
// drag-reorder elsewhere in this app - requested directly). newPath/
// newUrl are computed the moment the drop lands, not recomputed at
// confirm time, so what the dialog shows is exactly what gets sent.
interface PendingMove {
  entry: ContentListEntry;
  newParentEntry: ContentListEntry;
  newPath: string;
  newUrl: string;
}

// A delete waiting on the user's own confirmation - no confirmation-
// free delete the way Redirects/Menu items have (this app's own
// precedent there), since a whole page (and everything nested under
// it, per the tree) is a much bigger, harder-to-undo loss than a
// single redirect or menu item. hasChildren is captured at the moment
// Delete was clicked, purely to warn in the dialog's own message - the
// agent's own DELETE /v1/content/*path is what actually enforces this
// (rejects outright rather than cascading), so a stale computation
// here can never let a real deletion-with-children through silently.
interface PendingDelete {
  entry: ContentListEntry;
  hasChildren: boolean;
}

// A publish/set-as-draft waiting on the user's own confirmation. Both
// directions change what the public site actually serves, so neither is
// confirmation-free - the same reasoning PendingDelete above documents,
// even though this one is fully reversible (the opposite action is
// right there in the same menu).
interface PendingStatusChange {
  entry: ContentListEntry;
  next: 'published' | 'draft';
}

function lastPathSegment(path: string): string {
  const stem = relativePagePath(path).replace(/\.json$/, '');
  const segments = stem.split('/');
  return segments[segments.length - 1] as string;
}

export function PagesTabPanel({ siteId, onPreview, onMaxDepthChange, activeUrl, refreshToken }: PagesTabPanelProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [newPageModalOpen, setNewPageModalOpen] = useState(false);
  // The row a new page should be nested under, when the modal was
  // opened from a row's own "Add Child Page" rather than from the
  // panel's "Add Page" button. null means top level.
  const [childParentPath, setChildParentPath] = useState<string | null>(null);
  // The row being copied, when the modal was opened from "Duplicate
  // Page". null means this is an ordinary create, not a copy.
  const [duplicateSource, setDuplicateSource] = useState<ContentListEntry | null>(null);
  // A page just created, to be revealed in the tree once the reload
  // below brings it in. Kept in state rather than applied directly
  // because the collapse-seeding effect re-derives the whole collapsed
  // set from scratch on every entries change - expanding ancestors
  // outside that effect would simply be overwritten by it.
  const [revealPath, setRevealPath] = useState<string | null>(null);

  // Opens the same NewPageModal the panel's own "Add Page" button does,
  // but pointed at the row it was invoked from. The modal's Parent
  // dropdown stays editable afterwards, so this only seeds it.
  function handleRequestChildPage(entry: ContentListEntry): void {
    setDuplicateSource(null);
    setChildParentPath(entry.path);
    setNewPageModalOpen(true);
  }

  // Stays on this panel rather than following the new page into the
  // editor (requested directly): reload so the row exists, remember it
  // so the seeding effect above opens its branch, and preview it, which
  // is what draws the highlight (activeUrl comes back down from
  // PagesHubPage).
  function handleCreated(path: string, url: string): void {
    setNewPageModalOpen(false);
    setChildParentPath(null);
    setDuplicateSource(null);
    setRevealPath(path);
    retry();
    onPreview({ path, url });
  }

  // The same dialog again, in its duplicate mode - it seeds its own
  // title and parent from this entry, so nothing else is passed.
  function handleRequestDuplicate(entry: ContentListEntry): void {
    setChildParentPath(null);
    setDuplicateSource(entry);
    setNewPageModalOpen(true);
  }
  const [entries, setEntries] = useState<ContentListEntry[] | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const retry = useCallback(() => setReloadToken((count) => count + 1), []);
  // Drag-and-drop reparenting - lifted up here (not kept local to a
  // single row) since the row currently being dragged and the row
  // currently hovered as a prospective new parent are frequently two
  // different rows, anywhere in the recursive tree below.
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<PendingStatusChange | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

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
  }, [siteId, reloadToken, refreshToken]);

  useEffect(() => {
    if (entries === null) {
      return;
    }
    const allPages = entries.filter((entry) => !isMenuPath(entry.path));
    const parentPaths = new Set<string>();
    collectParentPaths(buildPageTree(allPages), parentPaths);
    // Everything starts collapsed except the branch leading to a page
    // just created, which would otherwise be created and then hidden.
    // Walks the whole ancestor chain, not just the immediate parent, so
    // a grandchild is reachable too.
    if (revealPath !== null) {
      for (let ancestor = pageParentPath(revealPath); ancestor !== null; ancestor = pageParentPath(ancestor)) {
        parentPaths.delete(ancestor);
      }
    }
    setCollapsedPaths(parentPaths);
  }, [entries, revealPath]);

  function handleToggle(path: string): void {
    // An explicit collapse/expand outranks the reveal from a just-created
    // page. Without this the reveal keeps applying on every later reload
    // (the seeding effect above keys on it), so a branch deliberately
    // closed would spring back open after an unrelated delete.
    setRevealPath(null);
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
  const pagesByPath = new Map((pages ?? []).map((entry) => [entry.path, entry]));

  // Whether `candidate` may accept `draggedPath` as a new child right
  // now - checked on every dragover (cheap: path-string comparisons
  // only, no tree walk), not just once at drop time, so an invalid
  // target never lights up as a drop target in the first place. Refuses
  // a candidate with no real url (nothing to nest a child url under),
  // the dragged page itself or any of its own current descendants
  // (would try to move a directory into itself), and the page's own
  // CURRENT parent (nothing would actually change).
  function isValidDropTarget(candidate: ContentListEntry): boolean {
    if (draggedPath === null || candidate.path === draggedPath) {
      return false;
    }
    if (candidate.url === null) {
      return false;
    }
    if (isSelfOrDescendantPage(candidate.path, draggedPath)) {
      return false;
    }
    // Home and 404 are fixed points: the renderer looks for them at
    // exactly their own paths, so dragging one anywhere silently breaks
    // it, and dropping onto one would nest a page at /index/<slug> or
    // /404/<slug>. Same two paths the New Page dialog already refuses as
    // parents - see protectedPages.ts.
    if (!canChangePagePath(draggedPath) || NON_PARENT_PAGE_PATHS.includes(candidate.path)) {
      return false;
    }
    return pageParentPath(draggedPath) !== candidate.path;
  }

  function handleRowDragStart(path: string): void {
    setDraggedPath(path);
  }

  function handleRowDragOver(event: DragEvent, candidate: ContentListEntry): void {
    if (!isValidDropTarget(candidate)) {
      return;
    }
    event.preventDefault();
    setDropTargetPath(candidate.path);
  }

  function handleRowDragLeave(candidatePath: string): void {
    setDropTargetPath((current) => (current === candidatePath ? null : current));
  }

  function handleRowDrop(event: DragEvent, candidate: ContentListEntry): void {
    event.preventDefault();
    const dragged = draggedPath !== null ? pagesByPath.get(draggedPath) : undefined;
    setDraggedPath(null);
    setDropTargetPath(null);
    if (!dragged || dragged.url === null || candidate.url === null || !isValidDropTarget(candidate)) {
      return;
    }
    const segment = lastPathSegment(dragged.path);
    const newPath = `${candidate.path.replace(/\.json$/, '')}/${segment}.json`;
    const newUrl = `${candidate.url}/${segment}`;
    setPendingMove({ entry: dragged, newParentEntry: candidate, newPath, newUrl });
  }

  function handleRowDragEnd(): void {
    setDraggedPath(null);
    setDropTargetPath(null);
  }

  async function handleConfirmMove(): Promise<void> {
    if (!pendingMove || pendingMove.entry.url === null) {
      return;
    }
    setMoveBusy(true);
    setMoveError(null);
    try {
      await moveSitePage(
        siteId,
        pendingMove.entry.url,
        pendingMove.newUrl,
        `Move ${pendingMove.entry.name || pendingMove.entry.path} under ${pendingMove.newParentEntry.name || pendingMove.newParentEntry.path}`,
        true,
      );
      setPendingMove(null);
      retry();
    } catch (err) {
      setMoveError(
        err instanceof SiteEditorError ? err.message : err instanceof Error ? err.message : 'Failed to move that page',
      );
    } finally {
      setMoveBusy(false);
    }
  }

  function handleRequestDelete(entry: ContentListEntry, hasChildren: boolean): void {
    setDeleteError(null);
    setPendingDelete({ entry, hasChildren });
  }

  function handleRequestStatusChange(entry: ContentListEntry): void {
    setStatusError(null);
    setPendingStatus({ entry, next: entry.published ? 'draft' : 'published' });
  }

  async function handleConfirmStatusChange(): Promise<void> {
    if (!pendingStatus) {
      return;
    }
    const { entry, next } = pendingStatus;
    const label = entry.name || entry.path;
    setStatusBusy(true);
    setStatusError(null);
    try {
      if (next === 'draft') {
        await unpublishSitePage(siteId, entry.path, `Set ${label} as a draft`);
      } else if (await siteContentHasLiveVersion(siteId, entry.path)) {
        // The ordinary case: a live page whose published flag is simply
        // off. Flipped in place, so any unrelated pending draft edits
        // stay pending rather than going live as a side effect.
        await publishSitePage(siteId, entry.path, `Publish ${label}`);
      } else {
        // A page that has never been published has no live file to flip
        // at all. Promoting its draft alone would not do it either: that
        // draft carries published:false, so the page would go live while
        // still hidden. Set the flag in the draft first, then promote -
        // one commit, and the same shape NewPageModal.tsx already uses to
        // create a page as published. Nothing is at risk here the way it
        // would be over a live page: with no published version, the draft
        // is the page.
        const current = await readSiteEditorContent(siteId, entry.path);
        const parsed = JSON.parse(current.content) as Record<string, unknown>;
        parsed.published = true;
        await saveSiteDraft(siteId, entry.path, JSON.stringify(parsed, null, 2), current.etag);
        await publishSiteDraft(siteId, entry.path, `Publish ${label}`);
      }
      setPendingStatus(null);
      retry();
    } catch (err) {
      setStatusError(
        err instanceof SiteEditorError
          ? err.message
          : err instanceof Error
            ? err.message
            : `Failed to ${next === 'draft' ? 'set that page as a draft' : 'publish that page'}`,
      );
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!pendingDelete) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteSitePage(
        siteId,
        pendingDelete.entry.path,
        `Delete ${pendingDelete.entry.name || pendingDelete.entry.path}`,
      );
      setPendingDelete(null);
      retry();
    } catch (err) {
      setDeleteError(
        err instanceof SiteEditorError ? err.message : err instanceof Error ? err.message : 'Failed to delete that page',
      );
    } finally {
      setDeleteBusy(false);
    }
  }

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
      {moveError && <p role="alert">{moveError}</p>}
      {deleteError && <p role="alert">{deleteError}</p>}
      {statusError && <p role="alert">{statusError}</p>}
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
              activeUrl={activeUrl}
              draggedPath={draggedPath}
              dropTargetPath={dropTargetPath}
              onRequestDelete={handleRequestDelete}
              onRequestChildPage={handleRequestChildPage}
              onRequestDuplicate={handleRequestDuplicate}
              onRequestStatusChange={handleRequestStatusChange}
              onRowDragStart={handleRowDragStart}
              onRowDragOver={handleRowDragOver}
              onRowDragLeave={handleRowDragLeave}
              onRowDrop={handleRowDrop}
              onRowDragEnd={handleRowDragEnd}
            />
          ))}
        </ul>
      )}
      <button
        type="button"
        className="instance-add-button"
        onClick={() => {
          setChildParentPath(null);
          setDuplicateSource(null);
          setNewPageModalOpen(true);
        }}
      >
        <AddIcon />
        Add Page
      </button>
      {newPageModalOpen && (
        <NewPageModal
          siteId={siteId}
          initialParentPath={childParentPath ?? undefined}
          duplicateFrom={duplicateSource ?? undefined}
          onCreated={handleCreated}
          onClose={() => {
            setNewPageModalOpen(false);
            setChildParentPath(null);
            setDuplicateSource(null);
          }}
        />
      )}
      {pendingMove && (
        <ConfirmDialog
          message={`Move "${pendingMove.entry.name || pendingMove.entry.path}" under "${pendingMove.newParentEntry.name || pendingMove.newParentEntry.path}"? Its path becomes ${relativePagePath(pendingMove.newPath)} and its url becomes ${pendingMove.newUrl}.`}
          confirmLabel="Move"
          busy={moveBusy}
          onConfirm={() => void handleConfirmMove()}
          onCancel={() => setPendingMove(null)}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          message={`Delete "${pendingDelete.entry.name || pendingDelete.entry.path}"? This cannot be undone.${
            pendingDelete.hasChildren ? ' This page has child pages of its own, which must be deleted first.' : ''
          }${notFoundPageWarning(pendingDelete.entry.path) ?? ''}`}
          confirmLabel="Delete"
          busy={deleteBusy}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {pendingStatus && (
        <ConfirmDialog
          message={
            pendingStatus.next === 'draft'
              ? `Set "${pendingStatus.entry.name || pendingStatus.entry.path}" as a draft? It stops being visible on the live website, and its url returns a 404 until it is published again.${notFoundPageWarning(pendingStatus.entry.path) ?? ''}`
              : `Publish "${pendingStatus.entry.name || pendingStatus.entry.path}"? It becomes visible on the live website.`
          }
          confirmLabel={pendingStatus.next === 'draft' ? 'Set as Draft' : 'Publish'}
          busy={statusBusy}
          onConfirm={() => void handleConfirmStatusChange()}
          onCancel={() => setPendingStatus(null)}
        />
      )}
    </div>
  );
}

interface PagesHubTreeRowProps {
  siteId: string;
  node: PageTreeNode;
  collapsedPaths: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onPreview: (page: PreviewablePage | null) => void;
  activeUrl: string | null;
  draggedPath: string | null;
  dropTargetPath: string | null;
  onRequestDelete: (entry: ContentListEntry, hasChildren: boolean) => void;
  onRequestChildPage: (entry: ContentListEntry) => void;
  onRequestDuplicate: (entry: ContentListEntry) => void;
  onRequestStatusChange: (entry: ContentListEntry) => void;
  onRowDragStart: (path: string) => void;
  onRowDragOver: (event: DragEvent, candidate: ContentListEntry) => void;
  onRowDragLeave: (candidatePath: string) => void;
  onRowDrop: (event: DragEvent, candidate: ContentListEntry) => void;
  onRowDragEnd: () => void;
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
function PagesHubTreeRow({
  siteId,
  node,
  collapsedPaths,
  onToggle,
  onPreview,
  activeUrl,
  draggedPath,
  dropTargetPath,
  onRequestDelete,
  onRequestChildPage,
  onRequestDuplicate,
  onRequestStatusChange,
  onRowDragStart,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onRowDragEnd,
}: PagesHubTreeRowProps) {
  const navigate = useNavigate();
  const { entry } = node;
  const isActive = entry.url !== null && entry.url === activeUrl;
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedPaths.has(entry.path);
  const editorHref = `/sites/${siteId}/editor?path=${encodeURIComponent(entry.path)}${
    entry.url !== null ? `&url=${encodeURIComponent(entry.url)}` : ''
  }`;
  const isDragging = draggedPath === entry.path;
  const isDropTarget = dropTargetPath === entry.path;
  // The floating name pill a real native drag shows pinned to the
  // cursor - same technique and same reasoning as SectionList.tsx's own
  // SectionRow (instance-rows.css positions .instance-row-drag-pill
  // off-screen at rest; a portal escapes .editor-sidebar's own
  // transform/overflow ancestry, which otherwise clips an "off-screen"
  // position: fixed element instead of actually moving it off-screen -
  // see that component's own comment for how this was found live).
  const dragPillRef = useRef<HTMLSpanElement>(null);

  function handleTitleClick(): void {
    if (entry.url !== null) {
      onPreview({ path: entry.path, url: entry.url });
    } else {
      // state, not a query param - a one-time signal for how THIS
      // navigation should open the editor (requested directly: land on
      // Page Meta, not the usual Sections default), not something worth
      // baking into the shareable/persisted URL (currentSite.ts's own
      // "last editor location" only ever stores pathname+search, so a
      // later revisit via that still opens on the ordinary default).
      navigate(editorHref, { state: { initialViewMode: 'metafields' } });
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

  return (
    <li className={`instance-row${isDragging ? ' is-dragging' : ''}`}>
      <div
        className={`instance-row-main${isActive ? ' is-selected' : ''}${isDropTarget ? ' is-drop-target' : ''}${entry.published ? '' : ' is-unpublished'}`}
        role="button"
        tabIndex={0}
        aria-label={entry.name || entry.path}
        onClick={handleTitleClick}
        onKeyDown={handleRowKeyDown}
        onDragOver={(event) => onRowDragOver(event, entry)}
        onDragLeave={() => onRowDragLeave(entry.path)}
        onDrop={(event) => onRowDrop(event, entry)}
      >
        {/* Absolutely positioned within .instance-row-main's own
            reserved left padding (instance-rows.css) - a url-less entry
            renders nothing here at all rather than a spacer, and the
            reserved padding means the cell after it never shifts
            either way. */}
        {entry.url !== null && (
          <span
            className="instance-row-drag-handle"
            draggable
            role="button"
            aria-label={`Drag to move ${entry.name || entry.path}`}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = 'move';
              if (dragPillRef.current) {
                event.dataTransfer.setDragImage(dragPillRef.current, 0, 12);
              }
              onRowDragStart(entry.path);
            }}
            onDragEnd={(event) => {
              event.stopPropagation();
              onRowDragEnd();
            }}
          >
            <span className="instance-row-drag-handle-icon">
              <DragHandleIcon />
            </span>
          </span>
        )}
        {/* No wrapping span any more - chevron/spacer and title are
            direct flex children of .instance-row-main, matching
            SectionList.tsx/BlockList.tsx's own <strong> sibling
            exactly (reported directly - Pages was the one row type
            still nesting these in an extra "cell" layer). */}
        {hasChildren ? (
          <button
            type="button"
            className="instance-row-chevron"
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${entry.name || entry.path}` : `Collapse ${entry.name || entry.path}`}
            onClick={handleToggleClick}
          >
            <span className={`instance-row-chevron-icon${collapsed ? '' : ' is-expanded'}`}>
              <AccordionArrowIcon />
            </span>
          </button>
        ) : (
          <span className="instance-row-chevron-spacer" aria-hidden="true" />
        )}
        <span className="page-tree-title" title={entry.name || entry.path}>
          {entry.name || entry.path}
        </span>
        {/* Sits before the actions menu (requested directly). Keyed off
            published, the same field that drives .is-unpublished above,
            so the badge and the row's own draft colouring can never
            disagree - deliberately not hasDraft, which means "has
            unpublished edits over a live page", a different state. */}
        {!entry.published && <span className="page-tree-draft-badge">Draft</span>}
        {/* One "More actions" menu rather than bare icons (requested
            directly). InstanceRowActions collapses to a kebab menu on
            its own once given more than two actions, so this needs no
            menu of its own. Edit carries `to` rather than an onClick so
            it still renders as a real anchor inside the menu, keeping
            middle-click and cmd-click open-in-new-tab - the reason it
            used to sit outside this component entirely.

            "Add Child Page" is omitted for Home and 404: both are
            excluded as parents (protectedPages.ts's own
            NON_PARENT_PAGE_PATHS - nesting under Home would resolve at
            /index/<slug>), so offering it here would open a modal that
            could not honour the parent it was invoked with. */}
        <InstanceRowActions
          collapse="always"
          actions={[
            {
              key: 'edit',
              label: 'Edit Page',
              icon: <EditIcon />,
              to: editorHref,
              state: { initialViewMode: 'metafields' },
            },
            ...(NON_PARENT_PAGE_PATHS.includes(entry.path)
              ? []
              : [
                  {
                    key: 'child',
                    label: 'Add Child Page',
                    icon: <AddIcon />,
                    onClick: () => onRequestChildPage(entry),
                  },
                ]),
            {
              key: 'duplicate',
              label: 'Duplicate Page',
              icon: <DuplicateIcon />,
              onClick: () => onRequestDuplicate(entry),
            },
            // One action, not two disabled ones: InstanceRowAction has no
            // disabled state, so a row offers whichever direction it can
            // actually go - the same way Home and 404 simply drop "Add
            // Child Page" rather than showing it greyed out.
            // Publish is never withheld, even on Home: it is not the
            // dangerous direction, and if Home has somehow ended up a
            // draft, publishing it is the way back. Only the flip
            // towards draft is omitted (protectedPages.ts).
            ...(entry.published && !canSetAsDraft(entry.path)
              ? []
              : [
                  entry.published
                    ? {
                        key: 'draft',
                        label: 'Set as Draft',
                        icon: <DraftIcon />,
                        onClick: () => onRequestStatusChange(entry),
                      }
                    : {
                        key: 'publish',
                        label: 'Publish',
                        icon: <PublishIcon />,
                        onClick: () => onRequestStatusChange(entry),
                      },
                ]),
            ...(canDeletePage(entry.path)
              ? [
                  {
                    key: 'delete',
                    label: 'Delete Page',
                    icon: <TrashIcon />,
                    variant: 'destructive' as const,
                    onClick: () => onRequestDelete(entry, hasChildren),
                  },
                ]
              : []),
          ]}
        />
        {entry.url !== null &&
          createPortal(
            <span className="instance-row-drag-pill" ref={dragPillRef} aria-hidden="true">
              {entry.name || entry.path}
            </span>,
            document.body,
          )}
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
              activeUrl={activeUrl}
              draggedPath={draggedPath}
              dropTargetPath={dropTargetPath}
              onRequestDelete={onRequestDelete}
              onRequestChildPage={onRequestChildPage}
              onRequestDuplicate={onRequestDuplicate}
              onRequestStatusChange={onRequestStatusChange}
              onRowDragStart={onRowDragStart}
              onRowDragOver={onRowDragOver}
              onRowDragLeave={onRowDragLeave}
              onRowDrop={onRowDrop}
              onRowDragEnd={onRowDragEnd}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
