import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { LoginPage } from '../../src/pages/LoginPage.tsx';

// Reports the real post-navigation pathname+search, not a fixed
// stand-in page - what LoginPage actually navigates to after a
// successful login is exactly what's under test here.
function LandedOn() {
  const location = useLocation();
  return <div>landed on {location.pathname + location.search}</div>;
}

function renderLoginPage(initialEntry: string | { pathname: string; state?: unknown } = '/login') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<LandedOn />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function submitLogin(username: string, password: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: username } });
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

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Login to Granite' })).toBeDefined());
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

  it('a successful login preserves the query string of the originally-requested page, not just its path - a real, if minor, pre-existing bug (e.g. a site\'s own ?site= redirect)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ id: 'dev-1', username: 'dev-1' }), { status: 200 }));
      }),
    );

    renderLoginPage({
      pathname: '/login',
      state: { from: { pathname: '/', search: '?site=mysite.example.com' } },
    });
    await submitLogin('dev-1', 'correct password');

    await waitFor(() => expect(screen.getByText('landed on /?site=mysite.example.com')).toBeDefined());
  });

  it('a login with no originally-requested page lands on / as before', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ id: 'dev-1', username: 'dev-1' }), { status: 200 }));
      }),
    );

    renderLoginPage();
    await submitLogin('dev-1', 'correct password');

    await waitFor(() => expect(screen.getByText('landed on /')).toBeDefined());
  });

  it('the OAuth link carries the originally-requested query string through, so the backend can restore it after the provider round trip', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        if (url === '/api/auth/providers') {
          return Promise.resolve(new Response(JSON.stringify({ providers: ['google'] }), { status: 200 }));
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderLoginPage({
      pathname: '/login',
      state: { from: { pathname: '/', search: '?site=mysite.example.com' } },
    });

    const googleLink = await screen.findByRole('link', { name: 'Sign in with Google' });
    expect(googleLink.getAttribute('href')).toBe('/api/auth/google?site=mysite.example.com');
  });

  it('links to the signup page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    renderLoginPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Login to Granite' })).toBeDefined());

    const signupLink = screen.getByRole('link', { name: 'Sign up' });
    expect(signupLink.getAttribute('href')).toBe('/signup');
  });
});
