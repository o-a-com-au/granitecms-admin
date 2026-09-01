import type { ContentListEntry } from '../api/site-content.ts';

export interface PageTreeNode {
  entry: ContentListEntry;
  children: PageTreeNode[];
}

// Pages already support nested paths (pages/about/team.json ->
// /about/team, per the agent's own pagePathToUrl) - there is no
// separate "parent id" field anywhere in the content model, and
// doesn't need one: a page's directory prefix already says which
// other page it nests under. "about/team.json" is a child of
// "about.json" if that file exists; if no page sits at that exact
// directory stem, the nested page is shown flattened at the top level
// rather than inventing a synthetic folder-only group nothing in the
// data actually represents.
// Exported (not just a private helper any more) - PagesTabPanel.tsx's
// own drag-and-drop reparenting needs the same "strip the pages/
// prefix" step this file already does internally, both to compute a
// dragged page's current parent (pageParentPath below) and its own
// final path segment (the part that survives a reparent unchanged).
export function relativePagePath(path: string): string {
  return path.startsWith('pages/') ? path.slice('pages/'.length) : path;
}

function stemOf(relativePath: string): string {
  return relativePath.replace(/\.json$/, '');
}

// The file path a page's parent WOULD have, purely from its own path's
// directory prefix - null for a root-level page (no parent). This is
// the same segments.slice(0, -1) step buildPageTree uses internally to
// look up a node's real parent, just exposed as its own question:
// drag-and-drop reparenting needs to know whether a prospective drop
// target is already this page's own current parent (not identity by
// object reference - the tree may not have found a real parent node at
// all if none exists at that stem, per buildPageTree's own "flattened
// to root" case), not whether the parent is real content.
export function pageParentPath(path: string): string | null {
  const segments = relativePagePath(path).replace(/\.json$/, '').split('/');
  if (segments.length === 1) {
    return null;
  }
  return `pages/${segments.slice(0, -1).join('/')}.json`;
}

// Whether `candidatePath` is `ancestorPath` itself, or nests underneath
// it - drag-and-drop reparenting must refuse both (dropping a page onto
// itself, or onto one of its own current descendants), since either
// would try to move a directory into itself. Pure path-prefix
// comparison (relativePagePath + stemOf), not a tree walk - the same
// directory-prefix relationship buildPageTree itself relies on to
// determine nesting in the first place.
export function isSelfOrDescendantPage(candidatePath: string, ancestorPath: string): boolean {
  const candidateStem = stemOf(relativePagePath(candidatePath));
  const ancestorStem = stemOf(relativePagePath(ancestorPath));
  return candidateStem === ancestorStem || candidateStem.startsWith(`${ancestorStem}/`);
}

// pages/index.json (the site root) and pages/404.json are not just
// conventionally-named pages - the agent's own renderer hardcodes both
// paths (public.ts: '/' resolves to index.json, any unmatched route
// falls back to rendering 404.json specifically), so pinning the tree
// display to those same two literal paths is keying off a real
// structural fact, not guessing from a name a page author could
// rename at any time.
function sortRank(entry: ContentListEntry): 0 | 1 | 2 {
  if (entry.path === 'pages/index.json') {
    return 0;
  }
  if (entry.path === 'pages/404.json') {
    return 2;
  }
  return 1;
}

// Sorted (and, per ContentBrowserPage.tsx, displayed) by name, not
// title - the whole point of the name field is that the tree can read
// "Home Page" while the rendered <title> says something else entirely
// (docs/build discussion: WordPress-style name distinct from title).
// The home/404 pin above only ever affects root-level ordering in
// practice (neither page can be nested), but applies at every level -
// simpler than special-casing just the root sort, and correct either
// way since a page at any other path always ranks 1.
function sortTree(nodes: PageTreeNode[]): void {
  nodes.sort((a, b) => {
    const rankDiff = sortRank(a.entry) - sortRank(b.entry);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return (a.entry.name || a.entry.path).localeCompare(b.entry.name || b.entry.path);
  });
  nodes.forEach((node) => sortTree(node.children));
}

export function buildPageTree(entries: ContentListEntry[]): PageTreeNode[] {
  const nodesByStem = new Map<string, PageTreeNode>();
  for (const entry of entries) {
    nodesByStem.set(stemOf(relativePagePath(entry.path)), { entry, children: [] });
  }

  const roots: PageTreeNode[] = [];
  for (const entry of entries) {
    const relative = relativePagePath(entry.path);
    const segments = relative.split('/');
    const node = nodesByStem.get(stemOf(relative)) as PageTreeNode;

    if (segments.length === 1) {
      roots.push(node);
      continue;
    }

    const parentStem = segments.slice(0, -1).join('/');
    const parent = nodesByStem.get(parentStem);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortTree(roots);
  return roots;
}

// Flattens the tree back into a depth-annotated list for rendering -
// simpler than a recursive component when what's actually needed is
// one <tr> per visible row, each knowing its own indent level and
// whether it currently has visible children.
export interface FlatPageTreeRow {
  node: PageTreeNode;
  depth: number;
}

// Takes a *collapsed* set, not an expanded one - this function's own
// default is "nothing collapsed" (an empty set shows everything), but
// ContentBrowserPage.tsx now seeds the set with every parent path on
// load so branches start collapsed there instead - this function
// itself just renders whatever collapsed set it's handed, with no
// opinion of its own on what the initial state should be.
export function flattenVisibleTree(
  nodes: PageTreeNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
): FlatPageTreeRow[] {
  const rows: FlatPageTreeRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.children.length > 0 && !collapsed.has(node.entry.path)) {
      rows.push(...flattenVisibleTree(node.children, collapsed, depth + 1));
    }
  }
  return rows;
}
