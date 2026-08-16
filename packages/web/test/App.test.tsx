import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AuthProvider } from '../src/auth/AuthContext.tsx';
import { ThemeProvider } from '../src/theme/ThemeContext.tsx';
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
        <RouterProvider router={router} />
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

  it('an authenticated visitor at / with no site ever visited is redirected to /settings, not the login screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 })),
    );

    renderApp(['/']);

    await waitFor(() => expect(screen.getByText('cms-agent admin')).toBeDefined());
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

    // PageEditorPage renders its own "Editor" heading in every status
    // (loading/not-found/load-error) - enough to prove the redirect
    // landed on the editor route, without needing to mock its content
    // API too (this test is about routing, not content-loading, which
    // is covered elsewhere).
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Editor' })).toBeDefined());
    expect(screen.queryByText('cms-agent admin')).toBeNull();
  });

  it('B1: /login itself is reachable while unauthenticated - the one exempt route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    renderApp(['/login']);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Log in' })).toBeDefined());
  });
});
