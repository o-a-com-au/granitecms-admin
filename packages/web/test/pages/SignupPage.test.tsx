import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { SignupPage } from '../../src/pages/SignupPage.tsx';

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
          expect(body).toEqual({ name: 'New Dev', email: 'new-dev@example.com', password: 'a real password' });
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

    fillAndSubmit('New Dev', 'new-dev@example.com', 'a real password');

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

    fillAndSubmit('Someone', 'taken@example.com', 'a real password');

    await waitFor(() =>
      expect(screen.getByText('An account with this email already exists - log in instead')).toBeDefined(),
    );
  });

  it('a too-short password surfaces the real server error inline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
        }
        if (url === '/api/auth/signup' && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              statusCode: 400,
              error: 'Bad Request',
              message: 'name, email, and a password of at least 8 characters are required',
            }),
            { status: 400 },
          );
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderSignupPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign up' })).toBeDefined());

    // The native minLength constraint would normally block this
    // client-side, but jsdom's form submission still fires onSubmit
    // in this test setup, so the server-error path is what's under
    // test here regardless.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Short' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'short@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByText('name, email, and a password of at least 8 characters are required')).toBeDefined(),
    );
  });

  it('links back to the login page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    renderSignupPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign up' })).toBeDefined());

    fireEvent.click(screen.getByRole('link', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByText('login page')).toBeDefined());
  });
});
