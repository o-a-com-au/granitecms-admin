import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { RedirectsTabPanel } from '../../src/pages/RedirectsTabPanel.tsx';

// RedirectsTabPanel no longer renders its own toolbar inline - it
// registers it via onUtilitiesChange (rendered directly by
// PagesHubPage.tsx in real use) instead. This stands in for that
// registration so the existing search/Add-button tests still find the
// toolbar somewhere in the DOM.
function RedirectsTabPanelWithUtilities({ siteId }: { siteId: string }) {
  const [utilities, setUtilities] = useState<ReactNode>(null);
  return (
    <>
      {utilities}
      <RedirectsTabPanel siteId={siteId} onUtilitiesChange={setUtilities} />
    </>
  );
}

const ENTRY = { from: '/old', to: '/new', note: 'moved page' };
const OTHER_ENTRY = { from: '/team', to: '/about/team' };

function installFakeApi(initialEntries: Array<{ from: string; to: string; note?: string }> = [ENTRY]) {
  let entries = [...initialEntries];
  const calls: Array<{ method: string; url: string }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? 'GET';
    calls.push({ method, url });

    if (method === 'GET' && url === '/api/sites/site-1/redirects') {
      return new Response(JSON.stringify({ entries }), { status: 200 });
    }
    if (method === 'POST' && url === '/api/sites/site-1/redirects') {
      const body = JSON.parse(init?.body as string) as { from: string; to: string; note?: string };
      entries = [...entries, body];
      return new Response(JSON.stringify({ entry: body, retargeted: [] }), { status: 200 });
    }
    if (method === 'PUT' && url === '/api/sites/site-1/redirects') {
      const body = JSON.parse(init?.body as string) as { from: string; to: string; note?: string };
      entries = entries.map((entry) => (entry.from === body.from ? body : entry));
      return new Response(JSON.stringify({ entry: body, retargeted: [] }), { status: 200 });
    }
    if (method === 'DELETE' && url === '/api/sites/site-1/redirects') {
      const body = JSON.parse(init?.body as string) as { from: string };
      entries = entries.filter((entry) => entry.from !== body.from);
      return new Response(null, { status: 204 });
    }

    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/sites/site-1/content']}>
      <Routes>
        <Route path="/sites/:siteId/content" element={<RedirectsTabPanelWithUtilities siteId="site-1" />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RedirectsTabPanel', () => {
  it('lists From/To as one row - Note is dropped, no room for a third column in this narrow panel', async () => {
    installFakeApi();
    renderPanel();

    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());
    expect(screen.getByText('/new')).toBeDefined();
    expect(screen.queryByText('moved page')).toBeNull();
  });

  it('shows an empty state when there are no redirects', async () => {
    installFakeApi([]);
    renderPanel();

    await waitFor(() => expect(screen.getByText('No redirects yet.')).toBeDefined());
  });

  it('Add opens the form, and saving refreshes the list', async () => {
    installFakeApi([]);
    renderPanel();
    await waitFor(() => expect(screen.getByText('No redirects yet.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('heading', { name: 'Add Redirect' })).toBeDefined();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '/old' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());
    expect(screen.queryByRole('heading', { name: 'Add Redirect' })).toBeNull();
  });

  it('the row\'s edit icon opens the form pre-filled, and saving refreshes the list', async () => {
    installFakeApi();
    renderPanel();
    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Edit redirect from /old' }));
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('/new');

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '/newer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('/newer')).toBeDefined());
  });

  it('filters the list by From or To, and shows a distinct message when nothing matches', async () => {
    installFakeApi([ENTRY, OTHER_ENTRY]);
    renderPanel();
    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());
    expect(screen.getByText('/team')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Search redirects'), { target: { value: 'team' } });
    expect(screen.queryByText('/old')).toBeNull();
    expect(screen.getByText('/team')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Search redirects'), { target: { value: 'nothing-matches-this' } });
    expect(screen.getByText('No redirects match your search.')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Search redirects'), { target: { value: '' } });
    expect(screen.getByText('/old')).toBeDefined();
    expect(screen.getByText('/team')).toBeDefined();
  });

  it('matches against To as well as From', async () => {
    installFakeApi([ENTRY, OTHER_ENTRY]);
    renderPanel();
    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('Search redirects'), { target: { value: 'about/team' } });

    expect(screen.queryByText('/old')).toBeNull();
    expect(screen.getByText('/team')).toBeDefined();
  });

  it('deletes a redirect with no confirmation step', async () => {
    const { calls } = installFakeApi();
    renderPanel();
    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete redirect from /old' }));

    await waitFor(() => expect(screen.getByText('No redirects yet.')).toBeDefined());
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/sites/site-1/redirects' });
  });
});
