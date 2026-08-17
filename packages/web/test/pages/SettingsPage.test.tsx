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

interface FakeClient {
  id: string;
  siteId: string;
  username: string;
  name: string;
  email: string;
  grantedAt: string;
}

// A real small in-memory fake of the /api/sites (+ /api/sites/:id/users)
// surface, not a single canned response - lets these tests exercise a
// genuine register -> list -> rotate -> delete -> invite -> revoke
// sequence the same way a real session would, mirroring this
// project's "empirical over mocked" bias even on the frontend.
function installFakeSitesApi(): { sites: FakeSite[]; clients: FakeClient[] } {
  const state = { sites: [] as FakeSite[], clients: [] as FakeClient[] };
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

      const usersListMatch = /^\/api\/sites\/([^/]+)\/users$/.exec(url);
      if (usersListMatch && method === 'GET') {
        const siteId = usersListMatch[1];
        const clients = state.clients.filter((client) => client.siteId === siteId);
        return new Response(
          JSON.stringify({
            clients: clients.map(({ id, username, name, email, grantedAt }) => ({ id, username, name, email, grantedAt })),
          }),
          { status: 200 },
        );
      }

      if (usersListMatch && method === 'POST') {
        const siteId = usersListMatch[1]!;
        const body = JSON.parse(init?.body as string) as { username: string; name: string; email: string };
        const existing = state.clients.find((client) => client.username === body.username);
        if (existing) {
          return new Response(JSON.stringify({ error: 'That username already belongs to a developer account' }), {
            status: 409,
          });
        }
        const now = new Date().toISOString();
        const entry: FakeClient = {
          id: `client-${nextId++}`,
          siteId,
          username: body.username,
          name: body.name,
          email: body.email,
          grantedAt: now,
        };
        state.clients.push(entry);
        return new Response(
          JSON.stringify({ id: entry.id, username: entry.username, name: entry.name, email: entry.email, grantedAt: entry.grantedAt, password: 'generated-one-time-password' }),
          { status: 201 },
        );
      }

      const revokeMatch = /^\/api\/sites\/([^/]+)\/users\/([^/]+)$/.exec(url);
      if (revokeMatch && method === 'DELETE') {
        const [, siteId, clientId] = revokeMatch;
        const before = state.clients.length;
        state.clients = state.clients.filter((client) => !(client.siteId === siteId && client.id === clientId));
        if (state.clients.length === before) {
          return new Response(JSON.stringify({ error: 'No access grant for this user on this site' }), { status: 404 });
        }
        return new Response(JSON.stringify({ ok: true, accountDeleted: true }), { status: 200 });
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

  it('"Manage access" expands the panel and shows "No clients have access yet." for a site with none', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Manage access' }));

    await waitFor(() => expect(screen.getByText('No clients have access yet.')).toBeDefined());
    expect(screen.getByText('Clients with access to https://client-one.example.com')).toBeDefined();
  });

  it('inviting a client adds them to the list and shows the one-time password once', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Manage access' }));
    await waitFor(() => expect(screen.getByText('No clients have access yet.')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-client' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Client' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new-client@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite client' }));

    await waitFor(() => expect(screen.getByText(/New Client \(new-client, new-client@example.com\)/)).toBeDefined());
    expect(screen.getByText(/One-time password for the new client: generated-one-time-password/)).toBeDefined();
    expect(state.clients.length).toBe(1);
  });

  it('revoking a client removes them from the list', async () => {
    const state = installFakeSitesApi();
    state.sites.push({
      id: 'site-1',
      url: 'https://client-one.example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
    });
    state.clients.push({
      id: 'client-1',
      siteId: 'site-1',
      username: 'existing-client',
      name: 'Existing Client',
      email: 'existing-client@example.com',
      grantedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderSettingsPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Manage access' }));
    await waitFor(() => expect(screen.getByText(/Existing Client/)).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(screen.getByText('No clients have access yet.')).toBeDefined());
  });

  it('a revoke that is not confirmed leaves the client in place', async () => {
    const state = installFakeSitesApi();
    state.sites.push({
      id: 'site-1',
      url: 'https://client-one.example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
    });
    state.clients.push({
      id: 'client-1',
      siteId: 'site-1',
      username: 'existing-client',
      name: 'Existing Client',
      email: 'existing-client@example.com',
      grantedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderSettingsPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Manage access' }));
    await waitFor(() => expect(screen.getByText(/Existing Client/)).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText(/Existing Client/)).toBeDefined();
  });

  it('inviting a username that conflicts with an existing developer shows the server error, without adding a client', async () => {
    const state = installFakeSitesApi();
    state.sites.push({
      id: 'site-1',
      url: 'https://client-one.example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
    });
    // installFakeSitesApi's own conflict check keys off an existing
    // client username, close enough to the real developer-conflict
    // case (both are "this username already exists") to exercise the
    // same UI error-handling path without duplicating the fake's
    // account-type bookkeeping.
    state.clients.push({
      id: 'client-1',
      siteId: 'site-1',
      username: 'taken-username',
      name: 'Someone Else',
      email: 'someone@example.com',
      grantedAt: '2026-01-01T00:00:00.000Z',
    });

    renderSettingsPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Manage access' }));
    await waitFor(() => expect(screen.getByText(/Someone Else/)).toBeDefined());

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'taken-username' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Client' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new-client@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite client' }));

    await waitFor(() => expect(screen.getByText('That username already belongs to a developer account')).toBeDefined());
    expect(state.clients.length).toBe(1);
  });

  it('"Hide access" collapses the panel', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Manage access' }));
    await waitFor(() => expect(screen.getByText('No clients have access yet.')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Hide access' }));

    expect(screen.queryByText('No clients have access yet.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Manage access' })).toBeDefined();
  });
});
