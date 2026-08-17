import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { HomeRedirect } from '../../src/pages/HomeRedirect.tsx';
import { createFakeStorage } from '../helpers/fakeStorage.ts';

function renderHome() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/settings" element={<div>settings page</div>} />
          <Route path="/sites/:siteId/editor" element={<div>editor page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function stubApi(user: Record<string, unknown>, sites: Array<{ id: string }> = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(JSON.stringify(user), { status: 200 });
      }
      if (url === '/api/sites') {
        return new Response(JSON.stringify(sites), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomeRedirect', () => {
  it('a developer with no remembered site is sent to /settings to register one', async () => {
    stubApi({ id: 'dev-1', username: 'dev-1', role: 'developer', status: 'active' });

    renderHome();

    await waitFor(() => expect(screen.getByText('settings page')).toBeDefined());
  });

  it('anyone with a remembered site lands directly in that site\'s editor, without fetching the site list', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    localStorage.setItem('cms-admin-last-site', 'site-1');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(
          JSON.stringify({ id: 'dev-1', username: 'dev-1', role: 'developer', status: 'active' }),
          { status: 200 },
        );
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHome();

    await waitFor(() => expect(screen.getByText('editor page')).toBeDefined());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sites');
  });

  it('a client with no remembered site lands on their first available site, not /settings (regression: /settings is developer-only and would otherwise redirect-loop against "/")', async () => {
    stubApi({ id: 'client-1', username: 'client-1', role: 'client', status: 'active' }, [{ id: 'site-1' }]);

    renderHome();

    await waitFor(() => expect(screen.getByText('editor page')).toBeDefined());
  });

  it('a client with no remembered site and no granted sites at all sees a plain message, not a crash or a loop', async () => {
    stubApi({ id: 'client-1', username: 'client-1', role: 'client', status: 'active' }, []);

    renderHome();

    await waitFor(() => expect(screen.getByText('No sites are available for this account yet.')).toBeDefined());
    expect(screen.queryByText('settings page')).toBeNull();
  });
});
