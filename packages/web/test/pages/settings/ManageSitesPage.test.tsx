import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ManageSitesPage } from '../../../src/pages/settings/ManageSitesPage.tsx';

interface FakeSite {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  status: { state: 'ok'; agentVersion: string; contentSchemaVersion: number; sqliteDriver: string };
}

// A small in-memory fake of the /api/sites surface, not a single
// canned response - lets these tests exercise a genuine
// register -> list sequence the same way a real session would.
function installFakeSitesApi(): { sites: FakeSite[] } {
  const state = { sites: [] as FakeSite[] };
  let nextId = 1;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url === '/api/sites' && method === 'GET') {
        return new Response(JSON.stringify(state.sites), { status: 200 });
      }

      if (url === '/api/sites' && method === 'POST') {
        const body = JSON.parse(init?.body as string) as { url: string; token: string };
        const now = new Date().toISOString();
        const entry: FakeSite = {
          id: `site-${nextId++}`,
          url: body.url,
          createdAt: now,
          updatedAt: now,
          status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
        };
        state.sites.push(entry);
        return new Response(JSON.stringify(entry), { status: 201 });
      }

      throw new Error(`unhandled fetch in test: ${method} ${url}`);
    }),
  );

  return state;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ManageSitesPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManageSitesPage', () => {
  it('shows "Nothing registered yet." when the registry is empty', async () => {
    installFakeSitesApi();
    renderPage();

    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());
  });

  it('registering a site adds it to the list and shows its live status', async () => {
    installFakeSitesApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Site URL'), { target: { value: 'https://client-one.example.com' } });
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());
    expect(screen.getByText(/OK - agent 1\.0\.0/)).toBeDefined();
  });

  it('registering a site navigates back to "/" so it becomes the current site', async () => {
    installFakeSitesApi();
    render(
      <MemoryRouter initialEntries={['/settings/sites']}>
        <Routes>
          <Route path="/settings/sites" element={<ManageSitesPage />} />
          <Route path="/" element={<div>redirected home</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Site URL'), { target: { value: 'https://client-one.example.com' } });
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText('redirected home')).toBeDefined());
  });

  it('each registered site links to its Manage Site page and its editor', async () => {
    const state = installFakeSitesApi();
    state.sites.push({
      id: 'site-1',
      url: 'https://client-one.example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/settings/sites/site-1');
    expect(screen.getByRole('link', { name: 'Browse content' }).getAttribute('href')).toBe('/sites/site-1/content');
  });

  it('a registration error is shown inline without adding a site', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/sites' && method === 'GET') {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (url === '/api/sites' && method === 'POST') {
          return new Response(JSON.stringify({ error: 'Could not reach that site' }), { status: 502 });
        }
        throw new Error(`unhandled fetch in test: ${method} ${url}`);
      }),
    );

    renderPage();
    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Site URL'), { target: { value: 'https://client-one.example.com' } });
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText('Could not reach that site')).toBeDefined());
    expect(screen.getByText('Nothing registered yet.')).toBeDefined();
  });
});
