import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MenusTabPanel } from '../../src/pages/MenusTabPanel.tsx';
import { PreviewProvider, usePreview } from '../../src/layout/PreviewContext.tsx';
import { createFakeDataTransfer } from '../helpers/fakeDataTransfer.ts';

// Renders previewGeneration as plain text - PreviewContext.tsx's own
// bumpPreview has no visible effect of its own to assert on directly
// (SharedPreviewRegion needs a real previewUrl/visible=true, neither of
// which this panel sets up itself - that's PagesHubPage's job), so this
// stands in as the simplest real (non-mocked) way to observe it firing.
function PreviewGenerationProbe() {
  const { previewGeneration } = usePreview();
  return <span data-testid="preview-generation">{previewGeneration}</span>;
}

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
  content: { schemaVersion: number; name?: string; items: Array<{ label: string; url: string }> };
  etag: string;
  source?: 'draft' | 'live';
}

// contentSchemaVersion is what the site's agent reports; 7 is the first
// that can store a menu's own display name.
function installFakeApi(entries: unknown[], menuFiles: Record<string, MenuFile>, { contentSchemaVersion = 6 } = {}) {
  const files: Record<string, MenuFile> = { ...menuFiles };
  let listedEntries = [...entries] as Array<{ path: string }>;
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(init.body as string) as unknown) : undefined;
    calls.push({ method, url, body });

    if (method === 'GET' && url === '/api/sites') {
      const status = { state: 'ok', agentVersion: '0.5.2', contentSchemaVersion, sqliteDriver: 'node:sqlite' };
      return new Response(JSON.stringify([{ id: 'site-1', url: 'http://site.example', createdAt: '', updatedAt: '', status }]), {
        status: 200,
      });
    }
    if (method === 'GET' && (url.endsWith('/content') || url.includes('/content?'))) {
      return new Response(JSON.stringify(listedEntries), { status: 200 });
    }
    const draftMatch = /\/drafts\/(.+)$/.exec(url);
    if (method === 'DELETE' && draftMatch) {
      const path = decodeURIComponent(draftMatch[1] as string);
      if (files[path]?.source === 'draft') {
        delete files[path];
        listedEntries = listedEntries.filter((entry) => entry.path !== path);
      }
      return new Response(null, { status: 204 });
    }
    const deleteMatch = /\/content\/(.+)$/.exec(url);
    if (method === 'DELETE' && deleteMatch) {
      const path = decodeURIComponent(deleteMatch[1] as string);
      if (!files[path]) {
        return new Response(JSON.stringify({ message: `No live page found at "${path}"` }), { status: 404 });
      }
      delete files[path];
      listedEntries = listedEntries.filter((entry) => entry.path !== path);
      return new Response(null, { status: 204 });
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
        headers: { etag: file.etag, 'x-content-source': file.source ?? 'live' },
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
      <PreviewProvider siteId="site-1">
        <Routes>
          <Route path="/sites/:siteId/content" element={<MenusTabPanel siteId="site-1" />} />
        </Routes>
        <PreviewGenerationProbe />
      </PreviewProvider>
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

  it('expanding a menu row reveals its items as children, by label only - no url/path shown', async () => {
    installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': {
        content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }, { label: 'About', url: '/about' }] },
        etag: '"etag-1"',
      },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Expand Main' }));

    expect(screen.getByText('Home', { selector: 'strong' })).toBeDefined();
    expect(screen.getByText('About', { selector: 'strong' })).toBeDefined();
    expect(screen.queryByText('/')).toBeNull();
    expect(screen.queryByText('/about')).toBeNull();
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
    expect(screen.getByText('Home', { selector: 'strong' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add Menu Item' }));
    expect(screen.getByRole('heading', { name: 'Add Menu Item' })).toBeDefined();

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Contact' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/contact' } });
    expect(screen.getByTestId('preview-generation').textContent).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Contact', { selector: 'strong' })).toBeDefined());
    const putCall = calls.find((call) => call.method === 'PUT');
    expect(putCall?.url).toBe('/api/sites/site-1/menus/menus/main.json');
    expect(putCall?.body).toMatchObject({
      content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }, { label: 'Contact', url: '/contact' }] },
    });
    // bumpPreview (PreviewContext.tsx) - the shared viewport may be
    // showing a page whose own nav renders this menu, and it stays
    // visible across tabs, so a save has to ask for a reload directly.
    expect(screen.getByTestId('preview-generation').textContent).toBe('1');
  });

  it("an item's edit icon opens the form pre-filled, and saving updates that item's url", async () => {
    const { calls } = installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] }, etag: '"etag-1"' },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }));
    expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe('/');

    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/home' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    const putCall = calls.find((call) => call.method === 'PUT');
    expect(putCall?.body).toMatchObject({ content: { items: [{ label: 'Home', url: '/home' }] } });
    expect(screen.getByTestId('preview-generation').textContent).toBe('1');
  });

  it('deletes a menu item with no confirmation step, and bumps the preview generation', async () => {
    const { calls } = installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': {
        content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }, { label: 'About', url: '/about' }] },
        etag: '"etag-1"',
      },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main' }));
    expect(screen.getByText('Home', { selector: 'strong' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Home' }));

    await waitFor(() => expect(screen.queryByText('Home', { selector: 'strong' })).toBeNull());
    expect(screen.getByText('About', { selector: 'strong' })).toBeDefined();
    const putCall = calls.find((call) => call.method === 'PUT');
    expect(putCall?.body).toMatchObject({ content: { items: [{ label: 'About', url: '/about' }] } });
    expect(screen.getByTestId('preview-generation').textContent).toBe('1');
  });

  it('dragging a menu item to reorder it PUTs the new array order and bumps the preview generation', async () => {
    const { calls } = installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': {
        content: {
          schemaVersion: 1,
          items: [{ label: 'Home', url: '/' }, { label: 'About', url: '/about' }, { label: 'Contact', url: '/contact' }],
        },
        etag: '"etag-1"',
      },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Expand Main' }));
    await waitFor(() => expect(screen.getByText('Home', { selector: 'strong' })).toBeDefined());

    const handles = screen.getAllByRole('button', { name: /^Drag to reorder /i });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);
    vi.spyOn(rows[2] as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      height: 40,
      bottom: 40,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.dragStart(handles[0] as HTMLElement, { dataTransfer: createFakeDataTransfer() });
    fireEvent.dragOver(rows[2] as HTMLElement, { clientY: 35 });
    fireEvent.drop(rows[2] as HTMLElement);

    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    const putCall = calls.find((call) => call.method === 'PUT');
    expect(putCall?.url).toBe('/api/sites/site-1/menus/menus/main.json');
    expect(putCall?.body).toMatchObject({
      content: { items: [{ label: 'About', url: '/about' }, { label: 'Contact', url: '/contact' }, { label: 'Home', url: '/' }] },
    });
    expect(screen.getByTestId('preview-generation').textContent).toBe('1');
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
  it('shows a menu\'s own display name in place of the filename-derived one', async () => {
    installFakeApi([FOOTER_MENU_ENTRY], {
      'menus/footerCompany.json': { content: { schemaVersion: 7, name: 'Company', items: [] }, etag: '"etag-1"' },
    });

    renderPanel();

    await waitFor(() => expect(screen.getByText('Company')).toBeDefined());
    expect(screen.queryByText('Footer Company')).toBeNull();
  });

  it('offers no Edit on a menu row while the site\'s agent cannot store a menu name', async () => {
    installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 6, items: [] }, etag: '"etag-1"' },
    });

    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Main' })).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Edit Main' })).toBeNull();
  });

  it('Edit renames a menu by its display name only: items and filename are untouched', async () => {
    const { calls } = installFakeApi(
      [MAIN_MENU_ENTRY],
      { 'menus/main.json': { content: { schemaVersion: 7, items: [{ label: 'Home', url: '/' }] }, etag: '"etag-1"' } },
      { contentSchemaVersion: 7 },
    );

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Main' }));
    // The row itself must not have toggled open from the same click.
    expect(screen.queryByText('Home', { selector: 'strong' })).toBeNull();
    // The ID is shown as-is (what a layout writes), read-only, never as a path.
    const idField = screen.getByLabelText('ID') as HTMLInputElement;
    expect(idField.value).toBe('main');
    expect(idField.readOnly).toBe(true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Header' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Header')).toBeDefined());
    const putCall = calls.find((call) => call.method === 'PUT');
    expect(putCall?.url).toBe('/api/sites/site-1/menus/menus/main.json');
    expect(putCall?.body).toEqual({
      content: { schemaVersion: 7, name: 'Header', items: [{ label: 'Home', url: '/' }] },
      message: 'Rename menu Main to Header',
    });
    expect(Number(screen.getByTestId('preview-generation').textContent)).toBeGreaterThan(0);
  });

  it('clearing the name removes it, falling back to the filename-derived label', async () => {
    const { calls } = installFakeApi(
      [MAIN_MENU_ENTRY],
      { 'menus/main.json': { content: { schemaVersion: 7, name: 'Header', items: [] }, etag: '"etag-1"' } },
      { contentSchemaVersion: 7 },
    );

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Header' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Main')).toBeDefined());
    const putCall = calls.find((call) => call.method === 'PUT');
    expect(putCall?.body).toEqual({ content: { schemaVersion: 7, items: [] }, message: 'Rename menu Header to Main' });
  });

  it('Delete asks for confirmation first, then deletes the live menu file and bumps the preview', async () => {
    const { calls } = installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 6, items: [{ label: 'Home', url: '/' }] }, etag: '"etag-1"' },
    });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Main' }));

    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('No menus found.')).toBeDefined());
    const deleteCall = calls.find((call) => call.method === 'DELETE' && call.url.includes('/content/'));
    expect(deleteCall?.url).toBe('/api/sites/site-1/content/menus/main.json');
    expect(deleteCall?.body).toEqual({ message: 'Delete menu Main' });
    expect(Number(screen.getByTestId('preview-generation').textContent)).toBeGreaterThan(0);
  });

  it('cancelling the delete confirmation deletes nothing', async () => {
    const { calls } = installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 6, items: [] }, etag: '"etag-1"' },
    });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Main' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Main')).toBeDefined();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('deletes a draft-only menu (created by an older admin) by discarding its draft', async () => {
    const { calls } = installFakeApi([MAIN_MENU_ENTRY], {
      'menus/main.json': { content: { schemaVersion: 1, items: [] }, etag: '"etag-1"', source: 'draft' },
    });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Main' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('No menus found.')).toBeDefined());
    expect(calls.some((call) => call.method === 'DELETE' && call.url === '/api/sites/site-1/drafts/menus/main.json')).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
