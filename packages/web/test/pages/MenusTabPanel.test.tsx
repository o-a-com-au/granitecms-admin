import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MenusTabPanel } from '../../src/pages/MenusTabPanel.tsx';

const PAGE_ENTRY = { path: 'pages/about.json', name: 'About', title: 'About', type: 'page', published: true, hasDraft: false, url: '/about' };
const MAIN_MENU_ENTRY = { path: 'menus/main.json', name: '', title: '', type: '', published: false, hasDraft: false, url: null };
const FOOTER_MENU_ENTRY = {
  path: 'menus/footerCompany.json',
  name: '',
  title: '',
  type: '',
  published: false,
  hasDraft: false,
  url: null,
};

interface MenuFile {
  content: { schemaVersion: number; items: Array<{ label: string; url: string }> };
  etag: string;
}

function installFakeApi(entries: unknown[], menuFiles: Record<string, MenuFile>) {
  const files: Record<string, MenuFile> = { ...menuFiles };
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(init.body as string) as unknown) : undefined;
    calls.push({ method, url, body });

    if (method === 'GET' && (url.endsWith('/content') || url.includes('/content?'))) {
      return new Response(JSON.stringify(entries), { status: 200 });
    }
    const contentMatch = /\/content\/(.+)$/.exec(url);
    if (method === 'GET' && contentMatch) {
      const path = decodeURIComponent(contentMatch[1] as string);
      const file = files[path];
      if (!file) {
        return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
      }
      return new Response(JSON.stringify(file.content), {
        status: 200,
        headers: { etag: file.etag, 'x-content-source': 'live' },
      });
    }
    const menusMatch = /\/menus\/(.+)$/.exec(url);
    if (method === 'PUT' && menusMatch) {
      const path = decodeURIComponent(menusMatch[1] as string);
      const newEtag = `"etag-${Object.keys(files).length + 1}"`;
      files[path] = { content: (body as { content: MenuFile['content'] }).content, etag: newEtag };
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: newEtag } });
    }

    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls, files };
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
  cleanup();
  vi.unstubAllGlobals();
});

describe('MenusTabPanel', () => {
  it('lists only entries under menus/, collapsed, showing no items until expanded', async () => {
    installFakeApi([PAGE_ENTRY, MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] }, etag: '"etag-1"' },
    });

    renderPanel();

    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    expect(screen.queryByText('pages/about.json')).toBeNull();
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('expanding a menu row reveals its items as children', async () => {
    installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': {
        content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }, { label: 'About', url: '/about' }] },
        etag: '"etag-1"',
      },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Expand Main' }));

    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('/')).toBeDefined();
    expect(screen.getByText('About')).toBeDefined();
    expect(screen.getByText('/about')).toBeDefined();
  });

  it('shows "No items yet." for a menu with an empty items array', async () => {
    installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 1, items: [] }, etag: '"etag-1"' },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main' }));

    expect(screen.getByText('No items yet.')).toBeDefined();
  });

  it('derives a readable name from the filename', async () => {
    installFakeApi([FOOTER_MENU_ENTRY], {
      'menus/footerCompany.json': { content: { schemaVersion: 1, items: [] }, etag: '"etag-1"' },
    });

    renderPanel();

    await waitFor(() => expect(screen.getByText('Footer Company')).toBeDefined());
  });

  it('shows "No menus found." when the site has none', async () => {
    installFakeApi([PAGE_ENTRY], {});

    renderPanel();

    await waitFor(() => expect(screen.getByText('No menus found.')).toBeDefined());
  });

  it('shows an "unreachable" message when the content list itself cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x', reason: 'unreachable' }), { status: 502 })));

    renderPanel();

    await waitFor(() => expect(screen.getByText('This website is unreachable right now.')).toBeDefined());
  });

  it('Add Menu Item opens the form, saving PUTs the updated items array and refreshes the row', async () => {
    const { calls } = installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] }, etag: '"etag-1"' },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main' }));
    expect(screen.getByText('Home')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add Menu Item' }));
    expect(screen.getByRole('heading', { name: 'Add Menu Item' })).toBeDefined();

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Contact' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Contact')).toBeDefined());
    const putCall = calls.find((call) => call.method === 'PUT');
    expect(putCall?.url).toBe('/api/sites/site-1/menus/menus/main.json');
    expect(putCall?.body).toMatchObject({
      content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }, { label: 'Contact', url: '/contact' }] },
    });
  });

  it("an item's edit icon opens the form pre-filled, and saving updates that item in place", async () => {
    installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] }, etag: '"etag-1"' },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }));
    expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe('/');

    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/home' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('/home')).toBeDefined());
  });

  it('deletes a menu item with no confirmation step', async () => {
    const { calls } = installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': {
        content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }, { label: 'About', url: '/about' }] },
        etag: '"etag-1"',
      },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main' }));
    expect(screen.getByText('Home')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Home' }));

    await waitFor(() => expect(screen.queryByText('Home')).toBeNull());
    expect(screen.getByText('About')).toBeDefined();
    const putCall = calls.find((call) => call.method === 'PUT');
    expect(putCall?.body).toMatchObject({ content: { items: [{ label: 'About', url: '/about' }] } });
  });

  it('the "Add Menu" button still opens the New Menu modal', async () => {
    installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 1, items: [] }, etag: '"etag-1"' },
    });

    renderPanel();

    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Add Menu' }));

    expect(screen.getByRole('heading', { name: 'New Menu' })).toBeDefined();
  });
});
