import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { RedirectsPage } from '../../src/pages/RedirectsPage.tsx';

const ENTRY = { from: '/old', to: '/new', note: 'moved page' };

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/sites/site-1/redirects']}>
      <Routes>
        <Route path="/sites/:siteId/redirects" element={<RedirectsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RedirectsPage', () => {
  it('lists redirects returned from the site', async () => {
    installFakeApi();
    renderPage();

    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());
    expect(screen.getByText('/new')).toBeDefined();
    expect(screen.getByText('moved page')).toBeDefined();
  });

  it('shows an empty state when there are no redirects', async () => {
    installFakeApi([]);
    renderPage();

    await waitFor(() => expect(screen.getByText('No redirects yet.')).toBeDefined());
  });

  it('Add Redirect opens the form, and saving refreshes the list', async () => {
    installFakeApi([]);
    renderPage();
    await waitFor(() => expect(screen.getByText('No redirects yet.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: '+ Add Redirect' }));
    expect(screen.getByRole('heading', { name: 'Add Redirect' })).toBeDefined();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '/old' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());
    expect(screen.queryByRole('heading', { name: 'Add Redirect' })).toBeNull();
  });

  it('Edit opens the form pre-filled, and saving refreshes the list', async () => {
    installFakeApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('/new');

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '/newer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('/newer')).toBeDefined());
  });

  it('deletes a redirect with no confirmation step', async () => {
    const { calls } = installFakeApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('/old')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete redirect from /old' }));

    await waitFor(() => expect(screen.getByText('No redirects yet.')).toBeDefined());
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/sites/site-1/redirects' });
  });
});
