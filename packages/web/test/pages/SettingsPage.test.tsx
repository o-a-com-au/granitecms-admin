import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SettingsPage } from '../../src/pages/SettingsPage.tsx';

function renderSettingsPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

interface FakeSite {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  status: { state: 'ok'; agentVersion: string; contentSchemaVersion: number; sqliteDriver: string };
}

// A real small in-memory fake of the /api/sites surface, not a
// single canned response - lets these tests exercise a genuine
// register -> list -> rotate -> delete sequence the same way a real
// session would, mirroring this project's "empirical over mocked"
// bias even on the frontend.
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

      const rotateMatch = /^\/api\/sites\/([^/]+)\/token$/.exec(url);
      if (rotateMatch && method === 'PUT') {
        const id = rotateMatch[1];
        const entry = state.sites.find((site) => site.id === id);
        if (!entry) {
          return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
        }
        entry.updatedAt = new Date().toISOString();
        return new Response(JSON.stringify(entry), { status: 200 });
      }

      const deleteMatch = /^\/api\/sites\/([^/]+)$/.exec(url);
      if (deleteMatch && method === 'DELETE') {
        const id = deleteMatch[1];
        state.sites = state.sites.filter((site) => site.id !== id);
        return new Response(null, { status: 204 });
      }

      throw new Error(`unhandled fetch in test: ${method} ${url}`);
    }),
  );

  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SettingsPage', () => {
  it('shows "Nothing registered yet." when the registry is empty', async () => {
    installFakeSitesApi();
    renderSettingsPage();

    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());
  });

  it('C1: registering a site adds it to the list', async () => {
    installFakeSitesApi();
    renderSettingsPage();
    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Site URL'), { target: { value: 'https://client-one.example.com' } });
    fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());
  });

  it('C2: the newly registered site shows its live status', async () => {
    installFakeSitesApi();
    renderSettingsPage();
    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Site URL'), { target: { value: 'https://client-one.example.com' } });
    fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText(/OK - agent 1\.0\.0/)).toBeDefined());
  });

  it('C3: rotating a token submits the new value and refreshes the row', async () => {
    const state = installFakeSitesApi();
    state.sites.push({
      id: 'site-1',
      url: 'https://client-one.example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
    });

    renderSettingsPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    fireEvent.change(screen.getByLabelText('New token for https://client-one.example.com'), {
      target: { value: 'a-brand-new-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(state.sites[0]?.updatedAt).not.toBe('2026-01-01T00:00:00.000Z'));
    // The rotate form closes back to the normal row actions afterward.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rotate token' })).toBeDefined());
  });

  it('C4: deleting a site (after confirming) removes it from the list', async () => {
    const state = installFakeSitesApi();
    state.sites.push({
      id: 'site-1',
      url: 'https://client-one.example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSettingsPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());
  });

  it('a delete that is not confirmed leaves the site in place', async () => {
    const state = installFakeSitesApi();
    state.sites.push({
      id: 'site-1',
      url: 'https://client-one.example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderSettingsPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText('https://client-one.example.com')).toBeDefined();
  });

  it('registering a site navigates back to "/" so it becomes the current site', async () => {
    installFakeSitesApi();
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/" element={<div>redirected home</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Site URL'), { target: { value: 'https://client-one.example.com' } });
    fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText('redirected home')).toBeDefined());
  });
});
