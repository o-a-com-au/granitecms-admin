import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ContentBrowserPage } from '../../src/pages/ContentBrowserPage.tsx';

const ENTRY_ONE = {
  path: 'pages/about.json',
  name: 'About',
  title: 'About',
  type: 'page',
  published: true,
  hasDraft: false,
  url: '/about',
  changedAt: '2026-08-05T10:00:00.000Z',
};
const ENTRY_TWO = {
  path: 'pages/contact.json',
  name: 'Contact',
  title: 'Contact',
  type: 'page',
  published: false,
  hasDraft: true,
  url: '/contact',
  changedAt: null,
};
const MENU_ENTRY = {
  path: 'menus/main.json',
  name: 'Main menu',
  title: 'Main menu',
  type: 'menu',
  published: true,
  hasDraft: false,
  url: null,
  changedAt: null,
};
const PARENT_ENTRY = {
  path: 'pages/about.json',
  name: 'About',
  title: 'About',
  type: 'page',
  published: true,
  hasDraft: false,
  url: '/about',
  changedAt: null,
};
const CHILD_ENTRY = {
  path: 'pages/about/team.json',
  name: 'Team',
  title: 'Team',
  type: 'page',
  published: true,
  hasDraft: false,
  url: '/about/team',
  changedAt: null,
};

function renderPage(initialPath = '/sites/site-1/content') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/sites/:siteId/content" element={<ContentBrowserPage />} />
        <Route path="/" element={<div>registry home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ContentBrowserPage', () => {
  it('D1: lists content with type, status, and changed-at', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPage();

    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());
    expect(screen.getByText('Live')).toBeDefined();
    expect(screen.getByText('Draft only')).toBeDefined();
    expect(screen.getAllByText('Page')).toHaveLength(2);
  });

  it('carries its own pages-list-table class alongside the shared list-table one, so mobile can hide its Type/Status/Changed columns without also hiding the Menus list\'s own column', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPage();

    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());
    const table = screen.getByRole('link', { name: 'About' }).closest('table');
    expect(table?.className.split(' ')).toEqual(expect.arrayContaining(['list-table', 'pages-list-table']));
  });

  it('shows "No pages found." for an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

    renderPage();

    await waitFor(() => expect(screen.getByText('No pages found.')).toBeDefined());
  });

  it('searches by name, title, or path, client-side against the already-fetched list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPage();
    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('Search Pages'), { target: { value: 'contact' } });

    expect(screen.queryByRole('link', { name: 'About' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Contact' })).toBeDefined();
  });

  it('the Published tab shows only published entries, and All Pages shows everything again', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPage();
    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Published' }));
    expect(screen.queryByRole('link', { name: 'Contact' })).toBeNull();
    expect(screen.getByRole('link', { name: 'About' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Unpublished' }));
    expect(screen.queryByRole('link', { name: 'About' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Contact' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'All Pages' }));
    expect(screen.getByRole('link', { name: 'About' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Contact' })).toBeDefined();
  });

  it('the tree displays each page\'s "name", not its "title" - the entire point of a separate name field', async () => {
    const entryWithDifferentTitle = {
      path: 'pages/home.json',
      name: 'Home Page',
      title: 'Welcome to Acme Co — Solid Foundations',
      type: 'page',
      published: true,
      hasDraft: false,
      url: '/',
      changedAt: null,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([entryWithDifferentTitle]), { status: 200 })));

    renderPage();

    await waitFor(() => expect(screen.getByRole('link', { name: 'Home Page' })).toBeDefined());
    expect(screen.queryByText('Welcome to Acme Co — Solid Foundations')).toBeNull();
  });

  it('searching by name finds a page even when the query does not appear in its title or path', async () => {
    const entryWithDifferentTitle = {
      path: 'pages/home.json',
      name: 'Home Page',
      title: 'Welcome to Acme Co — Solid Foundations',
      type: 'page',
      published: true,
      hasDraft: false,
      url: '/',
      changedAt: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([entryWithDifferentTitle, ENTRY_TWO]), { status: 200 })),
    );

    renderPage();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Home Page' })).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('Search Pages'), { target: { value: 'home page' } });

    expect(screen.getByRole('link', { name: 'Home Page' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Contact' })).toBeNull();
  });

  it('each row links to the editor route with the path and a status hint in state, named by its real title', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 })));

    renderPage();

    const link = await screen.findByRole('link', { name: 'About' });
    expect(link.getAttribute('href')).toBe('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
  });

  it('excludes menus entirely - they are edited from the Menus nav section, not this page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, MENU_ENTRY]), { status: 200 })),
    );

    renderPage();

    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());
    expect(screen.queryByText('menus/main.json')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Main menu' })).toBeNull();
  });

  it('shows an "unreachable" message when the site cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x', reason: 'unreachable' }), { status: 502 })),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('This site is unreachable right now.')).toBeDefined());
  });

  it('shows an "unauthorized" message with a link to Manage Site', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x', reason: 'unauthorized' }), { status: 502 })),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(/token was rejected/)).toBeDefined());
    const link = screen.getByRole('link', { name: 'Diagnose' });
    expect(link.getAttribute('href')).toBe('/settings/sites/site-1');
  });

  it('nests a page under its matching parent directory stem, collapsed by default, and expands/collapses via the chevron', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([PARENT_ENTRY, CHILD_ENTRY]), { status: 200 })),
    );

    renderPage();

    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());
    // The collapsed-by-default seed runs in a follow-up effect after
    // entries first resolves, not synchronously in the same render -
    // waitFor rather than an immediate assertion, so this doesn't race
    // that effect's own commit.
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Team' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Expand About' }));
    expect(screen.getByRole('link', { name: 'Team' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse About' }));
    expect(screen.queryByRole('link', { name: 'Team' })).toBeNull();
  });
});
