import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MenuEditorPage } from '../../src/pages/MenuEditorPage.tsx';

interface FakeState {
  content: string | null;
  etag: string | null;
  source: 'draft' | 'live';
  forceActionFailure?: boolean;
}

function installFakeMenuApi(initial: FakeState) {
  const state: FakeState = { ...initial };
  let etagCounter = 1;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('/content/')) {
      if (state.content === null || state.etag === null) {
        return new Response(JSON.stringify({ error: 'not found', reason: 'not-found' }), { status: 404 });
      }
      return new Response(state.content, {
        status: 200,
        headers: { etag: state.etag, 'x-content-source': state.source, 'content-type': 'application/json' },
      });
    }

    if (method === 'PUT' && url.includes('/drafts/')) {
      const headers = init?.headers as Record<string, string>;
      const ifMatch = headers['If-Match'];
      if (ifMatch !== state.etag) {
        return new Response(JSON.stringify({ statusCode: 409, error: 'Conflict', message: 'stale' }), {
          status: 409,
        });
      }
      state.content = init?.body as string;
      etagCounter += 1;
      state.etag = `"etag-${etagCounter}"`;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: state.etag } });
    }

    if (method === 'POST' && url.endsWith('/publish')) {
      const body = JSON.parse(init?.body as string) as { message: string };
      if (!body.message?.trim()) {
        return new Response(JSON.stringify({ error: 'path and message are both required' }), { status: 400 });
      }
      if (state.forceActionFailure) {
        return new Response(JSON.stringify({ error: 'Could not reach the site', reason: 'unreachable' }), {
          status: 502,
        });
      }
      state.source = 'live';
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (method === 'DELETE' && url.includes('/drafts/')) {
      state.source = 'live';
      return new Response(null, { status: 204 });
    }

    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { state };
}

const PAST_DEBOUNCE = { timeout: 2000 };

function renderPage(initialEntry = '/sites/site-1/menus/edit?path=menus%2Fmain.json') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/sites/:siteId/menus/edit" element={<MenuEditorPage />} />
        <Route path="/" element={<div>registry home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForActions(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Discard Changes' })).toBeDefined());
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const MENU_CONTENT = JSON.stringify({
  schemaVersion: 1,
  items: [
    { label: 'Home', url: '/' },
    { label: 'About', url: '/about' },
  ],
});

describe('MenuEditorPage', () => {
  it('loads and shows the menu name (derived from its filename) and each item', async () => {
    installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });

    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Main' })).toBeDefined());
    const labels = screen.getAllByLabelText('Label') as HTMLInputElement[];
    expect(labels.map((el) => el.value)).toEqual(['Home', 'About']);
    const urls = screen.getAllByLabelText('URL') as HTMLInputElement[];
    expect(urls.map((el) => el.value)).toEqual(['/', '/about']);
  });

  it('editing a label autosaves without an explicit save action', async () => {
    const api = installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(2));

    fireEvent.change(screen.getAllByLabelText('Label')[0] as HTMLInputElement, { target: { value: 'Homepage' } });

    await waitFor(
      () => expect(JSON.parse(api.state.content ?? '{}').items[0].label).toBe('Homepage'),
      PAST_DEBOUNCE,
    );
  });

  it('editing a URL autosaves the same way', async () => {
    const api = installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('URL')).toHaveLength(2));

    fireEvent.change(screen.getAllByLabelText('URL')[1] as HTMLInputElement, { target: { value: '/about-us' } });

    await waitFor(
      () => expect(JSON.parse(api.state.content ?? '{}').items[1].url).toBe('/about-us'),
      PAST_DEBOUNCE,
    );
  });

  it('adding an item appends an empty label/url pair', async () => {
    const api = installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: '+ Add menu item' }));

    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(3));
    await waitFor(
      () => expect(JSON.parse(api.state.content ?? '{}').items).toEqual([
        { label: 'Home', url: '/' },
        { label: 'About', url: '/about' },
        { label: '', url: '' },
      ]),
      PAST_DEBOUNCE,
    );
  });

  it('removing an item drops just that one', async () => {
    const api = installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Home' }));

    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(1));
    await waitFor(
      () => expect(JSON.parse(api.state.content ?? '{}').items).toEqual([{ label: 'About', url: '/about' }]),
      PAST_DEBOUNCE,
    );
  });

  it('moving an item down swaps it with its neighbour, and the first item cannot move up', async () => {
    const api = installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(2));

    expect(screen.getAllByRole('button', { name: 'Move up' })[0]).toHaveProperty('disabled', true);
    expect(screen.getAllByRole('button', { name: 'Move down' })[1]).toHaveProperty('disabled', true);

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0] as HTMLElement);

    await waitFor(
      () => expect(JSON.parse(api.state.content ?? '{}').items).toEqual([
        { label: 'About', url: '/about' },
        { label: 'Home', url: '/' },
      ]),
      PAST_DEBOUNCE,
    );
  });

  it('a conflict shows a clear message, not a generic error', async () => {
    const api = installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(2));

    api.state.etag = '"etag-99"';
    api.state.content = MENU_CONTENT;
    fireEvent.change(screen.getAllByLabelText('Label')[0] as HTMLInputElement, { target: { value: 'Changed' } });

    await waitFor(() => expect(screen.getByText('This menu changed since you opened it.')).toBeDefined(), PAST_DEBOUNCE);
  });

  it('publishing prompts for a message, then reflects the menu as now-live', async () => {
    const api = installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });
    vi.spyOn(window, 'prompt').mockReturnValue('Update main menu');
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(2));
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.state.source).toBe('live'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull());
  });

  it('discard is confirmed first; confirming returns the editor to the live version', async () => {
    installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(2));
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Discard Changes' })).toBeNull());
  });

  it('a failed publish leaves the draft state untouched and shows an inline error', async () => {
    const api = installFakeMenuApi({
      content: MENU_CONTENT,
      etag: '"etag-1"',
      source: 'draft',
      forceActionFailure: true,
    });
    vi.spyOn(window, 'prompt').mockReturnValue('Ship it');
    renderPage();
    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(2));
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.getByText('Could not reach the site')).toBeDefined());
    expect(api.state.source).toBe('draft');
  });

  it('links to the same git history route pages use, scoped to this menu\'s path', async () => {
    installFakeMenuApi({ content: MENU_CONTENT, etag: '"etag-1"', source: 'draft' });
    renderPage();

    await waitFor(() => expect(screen.getAllByLabelText('Label')).toHaveLength(2));
    const link = screen.getByRole('link', { name: 'History' });
    expect(link.getAttribute('href')).toBe('/sites/site-1/history?path=menus%2Fmain.json');
  });

  it('shows a clear message when nothing exists at this path', async () => {
    installFakeMenuApi({ content: null, etag: null, source: 'draft' });
    renderPage();

    await waitFor(() => expect(screen.getByText('No content found at this path.')).toBeDefined());
  });
});
