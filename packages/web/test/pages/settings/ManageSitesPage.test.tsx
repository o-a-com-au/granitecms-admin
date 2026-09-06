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
    expect(screen.getByText('Strong Connection')).toBeDefined();
    // site-2 is the collapsed row - Switch, not a status card.
    expect(screen.getByText('https://two.example.com')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Switch' })).toBeDefined();
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
    expect(screen.getByRole('button', { name: 'Switch' })).toBeDefined();
  });

  it('an unreachable/unauthorized active site shows the matching connection caption, and no Agent/Schema/Node (nothing to show)', async () => {
    installFakeSitesApi([
      { id: 'site-1', url: 'https://one.example.com', createdAt: '', updatedAt: '', status: { state: 'unauthorized', message: 'The stored token was rejected' } },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('https://one.example.com')).toBeDefined());
    expect(screen.getByText('Check Token')).toBeDefined();
    expect(screen.queryByText('Agent')).toBeNull();
  });

  it('clicking Switch on another site makes it the current one and navigates home', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeSitesApi([
      { id: 'site-1', url: 'https://one.example.com', createdAt: '', updatedAt: '', status: okStatus() },
      { id: 'site-2', url: 'https://two.example.com', createdAt: '', updatedAt: '', status: okStatus() },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Switch' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    await waitFor(() => expect(screen.getByText('redirected home')).toBeDefined());
    expect(localStorage.getItem('cms-admin-last-site')).toBe('site-2');
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
