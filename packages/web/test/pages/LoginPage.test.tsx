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
});
