import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PagesTabPanel } from '../../src/pages/PagesTabPanel.tsx';

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

function renderPanel(onPreview = vi.fn()) {
  return {
    onPreview,
    ...render(
      <MemoryRouter initialEntries={['/sites/site-1/content']}>
        <Routes>
          <Route path="/sites/:siteId/content" element={<PagesTabPanel siteId="site-1" onPreview={onPreview} />} />
        </Routes>
      </MemoryRouter>,
    ),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PagesTabPanel', () => {
  it('lists each page by name only - Type/Status/Changed are dropped, no room for them in this narrow panel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPanel();

    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());
    expect(screen.getByRole('link', { name: 'Contact' })).toBeDefined();
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByText('Page')).toBeNull();
  });

  it('shows "No pages found." for an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

    renderPanel();

    await waitFor(() => expect(screen.getByText('No pages found.')).toBeDefined());
  });

  it('searches by name, title, or path, client-side against the already-fetched list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPanel();
    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('Search pages'), { target: { value: 'contact' } });

    expect(screen.queryByRole('link', { name: 'About' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Contact' })).toBeDefined();
  });

  it('each row links straight to the editor route, unchanged from before', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 })));

    renderPanel();

    const link = await screen.findByRole('link', { name: 'About' });
    expect(link.getAttribute('href')).toBe('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
  });

  it('clicking a row\'s Preview button calls onPreview with that page\'s own url, without navigating away', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 })));
    const onPreview = vi.fn();

    renderPanel(onPreview);
    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Preview About' }));

    expect(onPreview).toHaveBeenCalledWith('/about');
  });

  it('excludes menus entirely - they live in the Menus tab instead', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, MENU_ENTRY]), { status: 200 })));

    renderPanel();

    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());
    expect(screen.queryByRole('link', { name: 'Main menu' })).toBeNull();
  });

  it('shows an "unreachable" message when the site cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x', reason: 'unreachable' }), { status: 502 })));

    renderPanel();

    await waitFor(() => expect(screen.getByText('This site is unreachable right now.')).toBeDefined());
  });

  it('nests a page under its matching parent directory stem, collapsed by default, and expands/collapses via the chevron', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([PARENT_ENTRY, CHILD_ENTRY]), { status: 200 })));

    renderPanel();

    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Team' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Expand About' }));
    expect(screen.getByRole('link', { name: 'Team' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse About' }));
    expect(screen.queryByRole('link', { name: 'Team' })).toBeNull();
  });

  it('the "Add Page" link opens the New Page modal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/theme/page-templates')) {
          return new Response(JSON.stringify({ templates: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([ENTRY_ONE]), { status: 200 });
      }),
    );

    renderPanel();

    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));

    expect(screen.getByRole('heading', { name: 'New Page' })).toBeDefined();
  });
});
