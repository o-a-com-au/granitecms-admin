import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router';
import { MenusTabPanel } from '../../src/pages/MenusTabPanel.tsx';

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

function installFakeContentApi(entries: unknown[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/content?') || url.endsWith('/content')) {
      return new Response(JSON.stringify(entries), { status: 200 });
    }
    throw new Error(`unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/sites/site-1/content']}>
      <Routes>
        <Route path="/sites/:siteId/content" element={<MenusTabPanel siteId="site-1" />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MenusTabPanel', () => {
  it('lists only entries under menus/, ignoring pages, by name alone - the old "Menu items" preview column is dropped', async () => {
    installFakeContentApi([PAGE_ENTRY, MAIN_MENU_ENTRY]);

    renderPanel();

    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    expect(screen.queryByText('pages/about.json')).toBeNull();
    expect(screen.queryByText('About')).toBeNull();
  });

  it("each row's Edit link points into the dedicated menu editor, not the page editor", async () => {
    installFakeContentApi([MAIN_MENU_ENTRY]);

    renderPanel();

    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    const link = screen.getByRole('link', { name: 'Edit Main' });
    expect(link.getAttribute('href')).toBe('/sites/site-1/menus/edit?path=menus%2Fmain.json');
  });

  it("clicking a row's own title also navigates into the dedicated menu editor - a menu has nothing to preview, so its title button falls back to navigating directly, same as a Pages row with no url", async () => {
    installFakeContentApi([MAIN_MENU_ENTRY]);

    const router = createMemoryRouter([{ path: '/sites/:siteId/content', element: <MenusTabPanel siteId="site-1" /> }], {
      initialEntries: ['/sites/site-1/content'],
    });
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Main' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Main' }));

    expect(router.state.location.pathname + router.state.location.search).toBe('/sites/site-1/menus/edit?path=menus%2Fmain.json');
  });

  it('derives a readable name from the filename', async () => {
    installFakeContentApi([FOOTER_MENU_ENTRY]);

    renderPanel();

    await waitFor(() => expect(screen.getByText('Footer Company')).toBeDefined());
  });

  it('shows "No menus found." when the site has none', async () => {
    installFakeContentApi([PAGE_ENTRY]);

    renderPanel();

    await waitFor(() => expect(screen.getByText('No menus found.')).toBeDefined());
  });

  it('shows an "unreachable" message when the site cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x', reason: 'unreachable' }), { status: 502 })));

    renderPanel();

    await waitFor(() => expect(screen.getByText('This site is unreachable right now.')).toBeDefined());
  });

  it('the "Add Menu" link opens the New Menu modal', async () => {
    installFakeContentApi([MAIN_MENU_ENTRY]);

    renderPanel();

    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Add Menu' }));

    expect(screen.getByRole('heading', { name: 'New Menu' })).toBeDefined();
  });
});
