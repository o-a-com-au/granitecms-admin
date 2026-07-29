import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { RequireAuth } from '../../src/auth/RequireAuth.tsx';

function renderGuarded(initialEntries: string[]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<div>login screen</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<div>protected home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequireAuth', () => {
  it('redirects to /login when unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    renderGuarded(['/']);

    await waitFor(() => expect(screen.getByText('login screen')).toBeDefined());
  });

  it('renders the protected content when authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 })),
    );

    renderGuarded(['/']);

    await waitFor(() => expect(screen.getByText('protected home')).toBeDefined());
  });

  it('renders nothing while the auth status is still loading, not a flash of the login screen', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    renderGuarded(['/']);

    expect(screen.queryByText('login screen')).toBeNull();
    expect(screen.queryByText('protected home')).toBeNull();
  });
});
