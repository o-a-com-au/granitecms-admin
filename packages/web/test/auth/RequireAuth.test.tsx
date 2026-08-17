import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('a paused account sees the paused notice instead of the protected content or the login screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'client-1', username: 'client-1', role: 'client', status: 'paused' }),
          { status: 200 },
        ),
      ),
    );

    renderGuarded(['/']);

    await waitFor(() => expect(screen.getByText('Your account is paused')).toBeDefined());
    expect(screen.queryByText('protected home')).toBeNull();
    expect(screen.queryByText('login screen')).toBeNull();
  });

  it('resuming from the paused notice calls /resume, re-fetches /me, and un-blocks the protected content', async () => {
    let currentStatus: 'active' | 'paused' = 'paused';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(
          JSON.stringify({ id: 'client-1', username: 'client-1', role: 'client', status: currentStatus }),
          { status: 200 },
        );
      }
      if (url === '/api/auth/resume' && init?.method === 'POST') {
        currentStatus = 'active';
        return new Response(JSON.stringify({ status: 'active' }), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderGuarded(['/']);
    await waitFor(() => expect(screen.getByText('Your account is paused')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Resume account' }));

    await waitFor(() => expect(screen.getByText('protected home')).toBeDefined());
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/resume', { method: 'POST' });
  });
});
