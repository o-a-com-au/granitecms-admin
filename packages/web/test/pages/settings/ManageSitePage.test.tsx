import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ManageSitePage } from '../../../src/pages/settings/ManageSitePage.tsx';

interface FakeSite {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  status: { state: 'ok'; agentVersion: string; contentSchemaVersion: number; sqliteDriver: string };
}

interface FakeOwner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface FakeClient {
  id: string;
  siteId: string;
  firstName: string;
  lastName: string;
  email: string;
  grantedAt: string;
}

interface FakeInvite {
  id: string;
  siteId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
}

const SITE: FakeSite = {
  id: 'site-1',
  url: 'https://client-one.example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
};

const OWNER: FakeOwner = { id: 'owner-1', firstName: 'Jane', lastName: 'Owner', email: 'jane@example.com' };

// A small in-memory fake of the /api/sites (+ .../token, .../users,
// .../invites) surface a single ManageSitePage exercises - real
// register -> rotate -> invite -> revoke -> delete sequences, not
// canned single responses, mirroring this project's own
// "empirical over mocked" bias even on the frontend.
function installFakeApi(options: { site?: FakeSite; owner?: FakeOwner | null } = {}): {
  sites: FakeSite[];
  clients: FakeClient[];
  invites: FakeInvite[];
} {
  const state = {
    sites: [options.site ?? SITE],
    clients: [] as FakeClient[],
    invites: [] as FakeInvite[],
    owner: options.owner === undefined ? OWNER : options.owner,
  };
  let nextId = 1;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url === '/api/sites' && method === 'GET') {
        return new Response(JSON.stringify(state.sites), { status: 200 });
      }

      const rotateMatch = /^\/api\/sites\/([^/]+)\/token$/.exec(url);
      if (rotateMatch && method === 'PUT') {
        const entry = state.sites.find((site) => site.id === rotateMatch[1]);
        if (!entry) {
          return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
        }
        entry.updatedAt = new Date().toISOString();
        return new Response(JSON.stringify(entry), { status: 200 });
      }

      const usersMatch = /^\/api\/sites\/([^/]+)\/users$/.exec(url);
      if (usersMatch && method === 'GET') {
        const siteId = usersMatch[1];
        return new Response(
          JSON.stringify({
            owner: state.owner,
            clients: state.clients.filter((client) => client.siteId === siteId),
          }),
          { status: 200 },
        );
      }

      const revokeClientMatch = /^\/api\/sites\/([^/]+)\/users\/([^/]+)$/.exec(url);
      if (revokeClientMatch && method === 'DELETE') {
        const [, siteId, clientId] = revokeClientMatch;
        state.clients = state.clients.filter((client) => !(client.siteId === siteId && client.id === clientId));
        return new Response(JSON.stringify({ ok: true, accountDeleted: true }), { status: 200 });
      }

      const invitesMatch = /^\/api\/sites\/([^/]+)\/invites$/.exec(url);
      if (invitesMatch && method === 'GET') {
        const siteId = invitesMatch[1];
        return new Response(JSON.stringify({ invites: state.invites.filter((invite) => invite.siteId === siteId) }), {
          status: 200,
        });
      }

      if (invitesMatch && method === 'POST') {
        const siteId = invitesMatch[1]!;
        const body = JSON.parse(init?.body as string) as { email: string };
        if (body.email === 'already-invited@example.com') {
          return new Response(
            JSON.stringify({ statusCode: 409, error: 'Conflict', message: 'That address already has a pending invite' }),
            { status: 409 },
          );
        }
        const now = new Date().toISOString();
        const invite: FakeInvite = {
          id: `invite-${nextId++}`,
          siteId,
          email: body.email,
          createdAt: now,
          expiresAt: '2026-12-31T00:00:00.000Z',
          claimedAt: null,
        };
        state.invites.push(invite);
        return new Response(JSON.stringify({ emailSent: true, url: `http://localhost/invite/${invite.id}`, expiresAt: invite.expiresAt }), {
          status: 201,
        });
      }

      const revokeInviteMatch = /^\/api\/sites\/([^/]+)\/invites\/([^/]+)$/.exec(url);
      if (revokeInviteMatch && method === 'DELETE') {
        const [, siteId, inviteId] = revokeInviteMatch;
        state.invites = state.invites.filter((invite) => !(invite.siteId === siteId && invite.id === inviteId));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      const deleteMatch = /^\/api\/sites\/([^/]+)$/.exec(url);
      if (deleteMatch && method === 'DELETE') {
        state.sites = state.sites.filter((site) => site.id !== deleteMatch[1]);
        return new Response(null, { status: 204 });
      }

      throw new Error(`unhandled fetch in test: ${method} ${url}`);
    }),
  );

  return state;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/sites/site-1']}>
      <Routes>
        <Route path="/settings/sites/:siteId" element={<ManageSitePage />} />
        <Route path="/settings/sites" element={<div>site list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManageSitePage', () => {
  it("shows the site's URL and live status", async () => {
    installFakeApi();
    renderPage();

    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());
    expect(screen.getByText(/OK - agent 1\.0\.0/)).toBeDefined();
  });

  it('rotating the token submits the new value and closes back to the normal action', async () => {
    const state = installFakeApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    fireEvent.change(screen.getByLabelText('New API token'), { target: { value: 'a-brand-new-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(state.sites[0]?.updatedAt).not.toBe('2026-01-01T00:00:00.000Z'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rotate token' })).toBeDefined());
  });

  it('Manage Access lists the owner first, non-revocable, then clients with Revoke Access', async () => {
    const state = installFakeApi();
    state.clients.push({
      id: 'client-1',
      siteId: 'site-1',
      firstName: 'Existing',
      lastName: 'Client',
      email: 'existing-client@example.com',
      grantedAt: '2026-01-01T00:00:00.000Z',
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('Jane Owner (owner)')).toBeDefined());

    expect(screen.getByText('Existing Client')).toBeDefined();
    const revokeButtons = screen.getAllByRole('button', { name: 'Revoke Access' });
    expect(revokeButtons.length).toBe(1);
  });

  it('revoking a client removes them from the Manage Access list', async () => {
    const state = installFakeApi();
    state.clients.push({
      id: 'client-1',
      siteId: 'site-1',
      firstName: 'Existing',
      lastName: 'Client',
      email: 'existing-client@example.com',
      grantedAt: '2026-01-01T00:00:00.000Z',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    await waitFor(() => expect(screen.getByText('Existing Client')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Revoke Access' }));

    await waitFor(() => expect(screen.queryByText('Existing Client')).toBeNull());
    expect(state.clients.length).toBe(0);
  });

  it('inviting multiple addresses at once reports how many succeeded', async () => {
    const state = installFakeApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Email addresses'), {
      target: { value: 'one@example.com, two@example.com\nthree@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(screen.getByText('3 invites sent')).toBeDefined());
    expect(state.invites.map((invite) => invite.email).sort()).toEqual(['one@example.com', 'three@example.com', 'two@example.com']);
    expect((screen.getByLabelText('Email addresses') as HTMLTextAreaElement).value).toBe('');
  });

  it('an address that fails is reported in the failure summary without blocking the others', async () => {
    installFakeApi();
    renderPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Email addresses'), {
      target: { value: 'good@example.com, already-invited@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() =>
      expect(
        screen.getByText('1 invite sent; 1 failed: already-invited@example.com (That address already has a pending invite)'),
      ).toBeDefined(),
    );
  });

  it('a pending invite appears in the list and can be cancelled', async () => {
    const state = installFakeApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Email addresses'), { target: { value: 'pending-client@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => expect(screen.getByText('pending-client@example.com')).toBeDefined());
    expect(state.invites.length).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel invite' }));

    await waitFor(() => expect(screen.queryByText('pending-client@example.com')).toBeNull());
    expect(state.invites.length).toBe(0);
  });

  it('deleting the website (after confirming) navigates back to /settings/sites', async () => {
    installFakeApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete this website' }));

    await waitFor(() => expect(screen.getByText('site list')).toBeDefined());
  });

  it('a delete that is not confirmed leaves the site in place', async () => {
    installFakeApi();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await waitFor(() => expect(screen.getByText('https://client-one.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete this website' }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText('https://client-one.example.com')).toBeDefined();
  });
});
