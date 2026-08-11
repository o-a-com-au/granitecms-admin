import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MenusPage } from '../../src/pages/MenusPage.tsx';

const PAGE_ENTRY = { path: 'pages/about.json', title: 'About', type: 'page', published: true, hasDraft: false, url: '/about' };
const MAIN_MENU_ENTRY = { path: 'menus/main.json', title: '', type: '', published: false, hasDraft: false, url: null };
const FOOTER_MENU_ENTRY = {
  path: 'menus/footerCompany.json',
  title: '',
  type: '',
  published: false,
  hasDraft: false,
  url: null,
};

function installFakeContentApi(entries: unknown[], menuContents: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/content?') || url.endsWith('/content')) {
      return new Response(JSON.stringify(entries), { status: 200 });
    }

    const match = /\/content\/(.+)$/.exec(url);
    if (match) {
      const path = decodeURIComponent(match[1] as string);
      if (path in menuContents) {
        return new Response(JSON.stringify(menuContents[path]), {
          status: 200,
          headers: { etag: '"etag-1"', 'x-content-source': 'live', 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'not found', reason: 'not-found' }), { status: 404 });
    }

    throw new Error(`unhandled fetch in test: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/sites/site-1/menus']}>
      <Routes>
        <Route path="/sites/:siteId/menus" element={<MenusPage />} />
        <Route path="/" element={<div>registry home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MenusPage', () => {
  it('lists only entries under menus/, ignoring pages, filtered by path prefix not the broken type filter', async () => {
    installFakeContentApi([PAGE_ENTRY, MAIN_MENU_ENTRY], {
      'menus/main.json': { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    expect(screen.queryByText('pages/about.json')).toBeNull();
    expect(screen.queryByText('About')).toBeNull();
  });

  it('each row links into the dedicated menu editor, not the page editor', async () => {
    installFakeContentApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    const link = screen.getByRole('link', { name: 'Main' });
    expect(link.getAttribute('href')).toBe('/sites/site-1/menus/edit?path=menus%2Fmain.json');
  });

  it('derives a readable name from the filename and joins item labels', async () => {
    installFakeContentApi([FOOTER_MENU_ENTRY], {
      'menus/footerCompany.json': {
        schemaVersion: 1,
        items: [
          { label: 'About Us', url: '/about' },
          { label: 'Our Team', url: '/team' },
        ],
      },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Footer Company')).toBeDefined());
    expect(screen.getByText('About Us, Our Team')).toBeDefined();
  });

  it('shows "No items" for a menu with an empty items array', async () => {
    installFakeContentApi([MAIN_MENU_ENTRY], { 'menus/main.json': { schemaVersion: 1, items: [] } });

    renderPage();

    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    expect(screen.getByText('No items')).toBeDefined();
  });

  it('degrades a single menu whose content fails to load to an empty preview, without failing the page', async () => {
    installFakeContentApi([MAIN_MENU_ENTRY, FOOTER_MENU_ENTRY], {
      'menus/footerCompany.json': { schemaVersion: 1, items: [{ label: 'About Us', url: '/about' }] },
      // menus/main.json deliberately absent from menuContents - its own GET 404s.
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Footer Company')).toBeDefined());
    expect(screen.getByText('Main')).toBeDefined();
    expect(screen.getByText('About Us')).toBeDefined();
    expect(screen.getByText('No items')).toBeDefined();
  });

  it('shows "No menus found." when the site has none', async () => {
    installFakeContentApi([PAGE_ENTRY], {});

    renderPage();

    await waitFor(() => expect(screen.getByText('No menus found.')).toBeDefined());
  });

  it('shows an "unreachable" message when the site cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x', reason: 'unreachable' }), { status: 502 })),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('This site is unreachable right now.')).toBeDefined());
  });
});
