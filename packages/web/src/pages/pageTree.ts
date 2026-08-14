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
function relativePagePath(path: string): string {
  return path.startsWith('pages/') ? path.slice('pages/'.length) : path;
}

function stemOf(relativePath: string): string {
  return relativePath.replace(/\.json$/, '');
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

// Takes a *collapsed* set, not an expanded one - branches are expanded
// by default (docs/design/Pages.png shows Home's own children already
// visible on load), so "nothing collapsed yet" already means "show
// everything" with no separate initialisation step needed once the
// page list first loads.
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
