import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AuthProvider } from '../src/auth/AuthContext.tsx';
import { ThemeProvider } from '../src/theme/ThemeContext.tsx';
import { routes } from '../src/App.tsx';

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

  it('an authenticated visitor at / sees the home page, not the login screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 })),
    );

    renderApp(['/']);

    await waitFor(() => expect(screen.getByText('cms-agent admin')).toBeDefined());
    expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull();
  });

  it('B1: /login itself is reachable while unauthenticated - the one exempt route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    renderApp(['/login']);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Log in' })).toBeDefined());
  });
});
