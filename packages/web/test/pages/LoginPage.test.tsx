import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { LoginPage } from '../../src/pages/LoginPage.tsx';

function renderLoginPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function submitLogin(username: string, password: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('shows one fixed error message on failure, proving no per-field leak client-side either', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        // The backend also returns this exact message, but the
        // frontend must show its own fixed string regardless of
        // whatever the response body actually says.
        return Promise.resolve(new Response(JSON.stringify({ error: 'anything at all' }), { status: 401 }));
      }),
    );

    renderLoginPage();
    await submitLogin('someone', 'wrong password');

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Invalid username or password'));
  });

  it('a successful login clears any prior error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 }));
      }),
    );

    renderLoginPage();
    await submitLogin('admin', 'correct password');

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('shows no OAuth buttons when no provider is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        if (url === '/api/auth/providers') {
          return Promise.resolve(new Response(JSON.stringify({ providers: [] }), { status: 200 }));
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderLoginPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Log in' })).toBeDefined());
    expect(screen.queryByRole('link', { name: 'Sign in with Google' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in with GitHub' })).toBeNull();
  });

  it('shows a real link (not a fetch-triggering button) for each configured OAuth provider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        if (url === '/api/auth/providers') {
          return Promise.resolve(new Response(JSON.stringify({ providers: ['google', 'github'] }), { status: 200 }));
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderLoginPage();

    const googleLink = await screen.findByRole('link', { name: 'Sign in with Google' });
    expect(googleLink.getAttribute('href')).toBe('/api/auth/google');

    const githubLink = screen.getByRole('link', { name: 'Sign in with GitHub' });
    expect(githubLink.getAttribute('href')).toBe('/api/auth/github');
  });
});
