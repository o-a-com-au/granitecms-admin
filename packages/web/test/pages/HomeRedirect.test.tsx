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
          <Route path="/onboarding" element={<div>onboarding page</div>} />
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
  it('a developer with no remembered site is sent to /onboarding to register their first site', async () => {
    stubApi({ id: 'dev-1', username: 'dev-1', role: 'developer', status: 'active' });

    renderHome();

    await waitFor(() => expect(screen.getByText('onboarding page')).toBeDefined());
  });

  it('anyone with a remembered site that still exists lands directly in that site\'s editor', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    localStorage.setItem('cms-admin-last-site', 'site-1');
    stubApi({ id: 'dev-1', username: 'dev-1', role: 'developer', status: 'active' }, [{ id: 'site-1' }]);

    renderHome();

    await waitFor(() => expect(screen.getByText('editor page')).toBeDefined());
  });

  // The actual bug this covers: readLastSiteId() only ever changes via
  // writeLastSiteId (AppShell.tsx) - it has no way to know a site was
  // deleted from the registry entirely (another tab, or the registry
  // being reset). Before this fix, a developer in that state was sent
  // straight into a doomed /sites/:id/editor route (a permanent
  // "SiteNotFoundError") instead of back to onboarding.
  it('a developer with a remembered site that no longer exists falls back to /onboarding instead of a doomed redirect', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    localStorage.setItem('cms-admin-last-site', 'deleted-site');
    stubApi({ id: 'dev-1', username: 'dev-1', role: 'developer', status: 'active' }, []);

    renderHome();

    await waitFor(() => expect(screen.getByText('onboarding page')).toBeDefined());
  });

  it('a client with no remembered site lands on their first available site, not /settings (regression: /settings is developer-only and would otherwise redirect-loop against "/")', async () => {
    stubApi({ id: 'client-1', username: 'client-1', role: 'client', status: 'active' }, [{ id: 'site-1' }]);

    renderHome();

    await waitFor(() => expect(screen.getByText('editor page')).toBeDefined());
  });

  it('a client with no remembered site and no granted sites at all sees a plain message, not a crash or a loop', async () => {
    stubApi({ id: 'client-1', username: 'client-1', role: 'client', status: 'active' }, []);

    renderHome();

    await waitFor(() => expect(screen.getByText('No websites are available for this account yet.')).toBeDefined());
    expect(screen.queryByText('onboarding page')).toBeNull();
  });

  it('a client with a remembered site that no longer exists falls back to their first current site instead', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    localStorage.setItem('cms-admin-last-site', 'revoked-site');
    stubApi({ id: 'client-1', username: 'client-1', role: 'client', status: 'active' }, [{ id: 'site-2' }]);

    renderHome();

    await waitFor(() => expect(screen.getByText('editor page')).toBeDefined());
  });
});
