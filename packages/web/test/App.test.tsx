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

  it('an authenticated visitor at / with no site ever visited is redirected to /onboarding, not the login screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(
            JSON.stringify({ id: 'admin', username: 'admin', role: 'developer', status: 'active' }),
            { status: 200 },
          );
        }
        if (url === '/api/sites') {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderApp(['/']);

    // A genuinely empty registry lands on the bare first-run welcome
    // screen at /onboarding (OnboardingPage.tsx) - distinct from
    // Settings > Manage Sites (ManageSitesPage.tsx), which always shows
    // the normal "Register a website" registry view even with zero
    // sites, reserved for a developer deliberately navigating there.
    await waitFor(() => expect(screen.getByText(/Welcome to Granite CMS/)).toBeDefined());
    expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull();
  });

  it('an authenticated visitor at / with a remembered site lands in that site\'s editor instead', async () => {
    const storage = createFakeStorage();
    storage.setItem('cms-admin-last-site', 'site-1');
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(
            JSON.stringify({ id: 'admin', username: 'admin', role: 'developer', status: 'active' }),
            { status: 200 },
          );
        }
        // HomeRedirect now validates the remembered site against the
        // real registry before trusting it (see HomeRedirect.tsx) -
        // site-1 has to genuinely exist here for the redirect to land.
        if (url === '/api/sites') {
          // A real SiteListEntry needs a url (AppShell's own top-bar
          // wordmark reads it to show the current site's address) -
          // { id: 'site-1' } alone used to be enough here since nothing
          // read any other field, but is no longer a realistic fixture.
          return new Response(JSON.stringify([{ id: 'site-1', url: 'http://localhost:3891' }]), { status: 200 });
        }
        // Anything else (the editor's own content fetch) is deliberately
        // left unmocked - this test is about routing, not content-
        // loading, which is covered elsewhere (see the comment below).
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderApp(['/']);

    // PageEditorPage's own .editor-page shell renders regardless of
    // load status (a SiteStatusPanel stands in for the sidebar/preview
    // while there's nothing real to show yet) - enough to prove the
    // redirect landed on the editor route, without needing to mock its
    // content API too (this test is about routing, not content-loading,
    // which is covered elsewhere).
    await waitFor(() => expect(document.querySelector('.editor-page')).not.toBeNull());
    expect(screen.queryByRole('heading', { name: 'Register a website' })).toBeNull();
  });

  it('deliberately navigating to Settings > Manage Sites shows the normal registry, not the onboarding screen, even with zero sites', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(
            JSON.stringify({ id: 'admin', username: 'admin', role: 'developer', status: 'active' }),
            { status: 200 },
          );
        }
        if (url === '/api/sites') {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderApp(['/settings/sites']);

    // Gates on auth resolving (RequireAuth) - the heading/sidebar
    // themselves don't depend on the sites fetch below.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Register a website' })).toBeDefined());
    expect(screen.getByRole('link', { name: 'Personal Details' })).toBeDefined();
    expect(screen.queryByText(/Welcome to Granite CMS/)).toBeNull();
    // A second, separate gate - "Nothing registered yet." additionally
    // depends on the /api/sites fetch resolving, which can still be
    // in flight at the moment the heading above first appears.
    await waitFor(() => expect(screen.getByText('Nothing registered yet.')).toBeDefined());
  });

  it('B1: /login itself is reachable while unauthenticated - the one exempt route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    renderApp(['/login']);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Log in' })).toBeDefined());
  });
});
