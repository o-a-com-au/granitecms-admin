import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { SignupPage } from '../../src/pages/SignupPage.tsx';
import { PASSWORD_REQUIREMENTS_MESSAGE } from '../../src/auth/passwordStrength.ts';

function renderSignupPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/" element={<div>home page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function fillAndSubmit(name: string, email: string, password: string): void {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SignupPage', () => {
  it('a successful signup establishes a session and navigates into the app', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
        }
        if (url === '/api/auth/signup' && init?.method === 'POST') {
          const body = JSON.parse(init.body as string) as { name: string; email: string; password: string };
          expect(body).toEqual({ name: 'New Dev', email: 'new-dev@example.com', password: 'Str0ng Passw0rd!' });
          return new Response(
            JSON.stringify({
              id: 'new-dev@example.com',
              username: 'new-dev@example.com',
              name: 'New Dev',
              email: 'new-dev@example.com',
              role: 'developer',
              status: 'active',
            }),
            { status: 200 },
          );
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderSignupPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign up' })).toBeDefined());

    fillAndSubmit('New Dev', 'new-dev@example.com', 'Str0ng Passw0rd!');

    await waitFor(() => expect(screen.getByText('home page')).toBeDefined());
  });

  it('an email that already has an account surfaces the real server error inline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
        }
        if (url === '/api/auth/signup' && init?.method === 'POST') {
          // Mirrors the real shape routes/auth.ts returns - error alone
          // is just "Conflict", message is the text that must show.
          return new Response(
            JSON.stringify({
              statusCode: 409,
              error: 'Conflict',
              message: 'An account with this email already exists - log in instead',
            }),
            { status: 409 },
          );
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderSignupPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign up' })).toBeDefined());

    fillAndSubmit('Someone', 'taken@example.com', 'Str0ng Passw0rd!');

    await waitFor(() =>
      expect(screen.getByText('An account with this email already exists - log in instead')).toBeDefined(),
    );
  });

  it('a weak password is rejected client-side, with no network call', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(null, { status: 401 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSignupPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign up' })).toBeDefined());

    fillAndSubmit('Short', 'short@example.com', 'short1');

    // getByRole('alert'), not getByText - the always-visible hint under
    // the field says the same thing, so a text query alone is ambiguous.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PASSWORD_REQUIREMENTS_MESSAGE));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/signup', expect.anything());
  });

  it('links back to the login page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    renderSignupPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign up' })).toBeDefined());

    fireEvent.click(screen.getByRole('link', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByText('login page')).toBeDefined());
  });
});
