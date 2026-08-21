import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AuthProvider } from '../src/auth/AuthContext.tsx';
import { ThemeProvider } from '../src/theme/ThemeContext.tsx';
import { ToastProvider } from '../src/toast/ToastContext.tsx';
import { routes } from '../src/App.tsx';
import { createFakeStorage } from './helpers/fakeStorage.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp(initialEntries: string[]) {
  const router = createMemoryRouter(routes, { initialEntries });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe('App', () => {
  it('B1: an unauthenticated visitor at / is redirected to the login screen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    renderApp(['/']);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Log in' })).toBeDefined());
  });

  it('an authenticated visitor at / with no site ever visited is redirected to /settings/sites, not the login screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'admin', username: 'admin', role: 'developer', status: 'active' }),
          { status: 200 },
        ),
      ),
    );

    renderApp(['/']);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Register a website' })).toBeDefined());
    expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull();
  });

  it('an authenticated visitor at / with a remembered site lands in that site\'s editor instead', async () => {
    const storage = createFakeStorage();
    storage.setItem('cms-admin-last-site', 'site-1');
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 })),
    );

    renderApp(['/']);

    // PageEditorPage's own editor-tabs tablist renders unconditionally
    // now, regardless of load status (the shell stays mounted through
    // loading/not-found/load-error - see this group's own plan doc) -
    // enough to prove the redirect landed on the editor route, without
    // needing to mock its content API too (this test is about routing,
    // not content-loading, which is covered elsewhere).
    await waitFor(() => expect(screen.getByRole('tablist', { name: 'Editor view' })).toBeDefined());
    expect(screen.queryByRole('heading', { name: 'Register a website' })).toBeNull();
  });

  it('B1: /login itself is reachable while unauthenticated - the one exempt route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    renderApp(['/login']);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Log in' })).toBeDefined());
  });
});
