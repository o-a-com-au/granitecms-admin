import { describe, expect, it } from 'vitest';
import type { ContentListEntry } from '../../src/api/site-content.ts';
import { buildPageTree, flattenVisibleTree } from '../../src/pages/pageTree.ts';

function entry(path: string, name: string): ContentListEntry {
  return { path, name, title: name, type: 'page', published: true, hasDraft: false, url: null, changedAt: null };
}

describe('buildPageTree', () => {
  it('flat pages with no nesting all become root nodes', () => {
    const tree = buildPageTree([entry('pages/about.json', 'About'), entry('pages/contact.json', 'Contact')]);

    expect(tree.map((node) => node.entry.path)).toEqual(['pages/about.json', 'pages/contact.json']);
    expect(tree.every((node) => node.children.length === 0)).toBe(true);
  });

  it('a page nested under a matching directory stem becomes that page\'s child', () => {
    const tree = buildPageTree([entry('pages/about.json', 'About'), entry('pages/about/team.json', 'Team')]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.entry.path).toBe('pages/about.json');
    expect(tree[0]?.children.map((child) => child.entry.path)).toEqual(['pages/about/team.json']);
  });

  it('a nested page with no matching parent stem is flattened to root, not invented as a synthetic folder', () => {
    const tree = buildPageTree([entry('pages/about/team.json', 'Team')]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.entry.path).toBe('pages/about/team.json');
    expect(tree[0]?.children).toEqual([]);
  });

  it('sorts every level alphabetically by name', () => {
    const tree = buildPageTree([
      entry('pages/zebra.json', 'Zebra'),
      entry('pages/apple.json', 'Apple'),
      entry('pages/apple/zoo.json', 'Zoo'),
      entry('pages/apple/bar.json', 'Bar'),
    ]);

    expect(tree.map((node) => node.entry.name)).toEqual(['Apple', 'Zebra']);
    expect(tree[0]?.children.map((child) => child.entry.name)).toEqual(['Bar', 'Zoo']);
  });

  it('pins pages/index.json first and pages/404.json last, everything else alphabetical between them', () => {
    const tree = buildPageTree([
      entry('pages/zebra.json', 'Zebra'),
      entry('pages/404.json', 'Not found'),
      entry('pages/apple.json', 'Apple'),
      entry('pages/index.json', 'Zzz - should still sort first by path, not name'),
    ]);

    expect(tree.map((node) => node.entry.path)).toEqual([
      'pages/index.json',
      'pages/apple.json',
      'pages/zebra.json',
      'pages/404.json',
    ]);
  });

  it('a page merely named "404" or "index" at some other path is not pinned - only the literal reserved paths are', () => {
    const tree = buildPageTree([
      entry('pages/about/404.json', 'A page about the number 404'),
      entry('pages/apple.json', 'Apple'),
    ]);

    // Alphabetical, same as any other pair - no pinning kicks in.
    expect(tree.map((node) => node.entry.path)).toEqual(['pages/about/404.json', 'pages/apple.json']);
  });

  it('sorts by name even when it differs from title - the entire point of a separate name field', () => {
    const tree = buildPageTree([
      { ...entry('pages/home.json', 'Zeta'), title: 'Welcome to Acme Co' },
      { ...entry('pages/about.json', 'Alpha'), title: 'About the Company' },
    ]);

    // Sorted by name (Alpha, Zeta), not by title (About.../Welcome...
    // would sort the other way around).
    expect(tree.map((node) => node.entry.name)).toEqual(['Alpha', 'Zeta']);
    expect(tree.map((node) => node.entry.path)).toEqual(['pages/about.json', 'pages/home.json']);
  });
});

describe('flattenVisibleTree', () => {
  it('with an empty collapsed set, every node is visible, depth-annotated in document order', () => {
    const tree = buildPageTree([entry('pages/about.json', 'About'), entry('pages/about/team.json', 'Team')]);

    const rows = flattenVisibleTree(tree, new Set());

    expect(rows.map((row) => [row.node.entry.path, row.depth])).toEqual([
      ['pages/about.json', 0],
      ['pages/about/team.json', 1],
    ]);
  });

  it('a path in the collapsed set hides its children but not itself', () => {
    const tree = buildPageTree([entry('pages/about.json', 'About'), entry('pages/about/team.json', 'Team')]);

    const rows = flattenVisibleTree(tree, new Set(['pages/about.json']));

    expect(rows.map((row) => row.node.entry.path)).toEqual(['pages/about.json']);
  });
});
