import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ManageSitesPage } from '../../../src/pages/settings/ManageSitesPage.tsx';
import { createFakeStorage } from '../../helpers/fakeStorage.ts';

interface FakeSite {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  status:
    | { state: 'ok'; agentVersion: string; contentSchemaVersion: number; sqliteDriver: string }
    | { state: 'unreachable' | 'unauthorized' | 'error'; message: string };
}

function okStatus(): FakeSite['status'] {
  return { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' };
}

function installFakeSitesApi(sites: FakeSite[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/sites' && method === 'GET') {
        return new Response(JSON.stringify(sites), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${method} ${url}`);
    }),
  );
}

function renderPage(initialEntries: string[] = ['/settings/sites']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/settings/sites" element={<ManageSitesPage />} />
        <Route path="/" element={<div>redirected home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManageSitesPage', () => {
  it('shows "Nothing registered yet." when the registry is empty, with a way to add one', async () => {
    installFakeSitesApi([]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Add Website' }).getAttribute('href')).toBe('/settings/sites/new');
  });

  it('with no last-active site remembered, the first registered site gets the expanded status card', async () => {
    installFakeSitesApi([
      { id: 'site-1', url: 'https://one.example.com', createdAt: '', updatedAt: '', status: okStatus() },
      { id: 'site-2', url: 'https://two.example.com', createdAt: '', updatedAt: '', status: okStatus() },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('https://one.example.com')).toBeDefined());
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('Agent')).toBeDefined();
    expect(screen.getByText('1.0.0')).toBeDefined();
    // SiteConnectionPanel's own brief "checking" beat (see its own test
    // file for that in detail) delays the real caption slightly - a
    // generous real-timer waitFor here rather than fake timers, to
    // keep this integration test simple.
    await waitFor(() => expect(screen.getByText('Strong Connection')).toBeDefined(), { timeout: 2000 });
    // site-2 is the collapsed row - Activate, not a status card.
    expect(screen.getByText('https://two.example.com')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDefined();
  });

  it('the site remembered as last-active gets the expanded card, not whichever comes first in the list', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    localStorage.setItem('cms-admin-last-site', 'site-2');
    installFakeSitesApi([
      { id: 'site-1', url: 'https://one.example.com', createdAt: '', updatedAt: '', status: okStatus() },
      { id: 'site-2', url: 'https://two.example.com', createdAt: '', updatedAt: '', status: okStatus() },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('https://two.example.com')).toBeDefined());
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDefined();
  });

  it('an unreachable/unauthorized active site shows the matching connection caption, and no Agent/Schema/Node (nothing to show)', async () => {
    installFakeSitesApi([
      { id: 'site-1', url: 'https://one.example.com', createdAt: '', updatedAt: '', status: { state: 'unauthorized', message: 'The stored token was rejected' } },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('https://one.example.com')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Check Token')).toBeDefined(), { timeout: 2000 });
    expect(screen.queryByText('Agent')).toBeNull();
  });

  it('clicking Activate makes that site active in place - it neither navigates away nor reorders the list', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeSitesApi([
      { id: 'site-1', url: 'https://one.example.com', createdAt: '', updatedAt: '', status: okStatus() },
      { id: 'site-2', url: 'https://two.example.com', createdAt: '', updatedAt: '', status: okStatus() },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    // Still on this page - Activate only changes which card is active,
    // Edit Content (below) is the one action that actually navigates.
    expect(screen.queryByText('redirected home')).toBeNull();
    expect(localStorage.getItem('cms-admin-last-site')).toBe('site-2');
    // site-1 stays first in the list (its own original registry
    // position, not reshuffled to the back) - only its own shape
    // changes, from the expanded card back to a plain row with its own
    // Activate button again.
    const rows = screen.getAllByText(/example\.com/);
    expect(rows.map((row) => row.textContent)).toEqual(['https://one.example.com', 'https://two.example.com']);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate' })).toBeDefined());
  });

  it('activating a different site collapses the previously-active one back to a plain row', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeSitesApi([
      { id: 'site-1', url: 'https://one.example.com', createdAt: '', updatedAt: '', status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' } },
      { id: 'site-2', url: 'https://two.example.com', createdAt: '', updatedAt: '', status: { state: 'ok', agentVersion: '2.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' } },
    ]);
    renderPage();
    // site-1 starts active (the fallback default) - only one Activate
    // button exists (site-2's own row), and site-1's own metadata is
    // showing.
    await waitFor(() => expect(screen.getByText('1.0.0')).toBeDefined());
    expect(screen.queryAllByRole('button', { name: 'Activate' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    // site-2 is now active - its own metadata replaces site-1's, and
    // site-1 has collapsed back to a plain row with its own Activate
    // button (still one Activate button total, just the other site's
    // now).
    await waitFor(() => expect(screen.getByText('2.0.0')).toBeDefined());
    expect(screen.queryByText('1.0.0')).toBeNull();
    expect(screen.queryAllByRole('button', { name: 'Activate' })).toHaveLength(1);
  });

  it('Edit Content on the active card takes you into that site\'s editor and remembers it as current', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeSitesApi([{ id: 'site-1', url: 'https://one.example.com', createdAt: '', updatedAt: '', status: okStatus() }]);
    render(
      <MemoryRouter initialEntries={['/settings/sites']}>
        <Routes>
          <Route path="/settings/sites" element={<ManageSitesPage />} />
          <Route path="/sites/:siteId/editor" element={<div>the editor</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Content' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Edit Content' }));

    await waitFor(() => expect(screen.getByText('the editor')).toBeDefined());
    expect(localStorage.getItem('cms-admin-last-site')).toBe('site-1');
  });

  it('each site (active card and collapsed row alike) links Manage to its own Manage Site page', async () => {
    installFakeSitesApi([
      { id: 'site-1', url: 'https://one.example.com', createdAt: '', updatedAt: '', status: okStatus() },
      { id: 'site-2', url: 'https://two.example.com', createdAt: '', updatedAt: '', status: okStatus() },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('https://one.example.com')).toBeDefined());

    const manageLinks = screen.getAllByRole('link', { name: 'Manage' });
    expect(manageLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/settings/sites/site-1',
      '/settings/sites/site-2',
    ]);
  });
});
