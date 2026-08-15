import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { ThemeProvider } from '../../src/theme/ThemeContext.tsx';
import { AppShell } from '../../src/layout/AppShell.tsx';

const SITE = {
  id: 'site-1',
  url: 'http://localhost:3891',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: { state: 'ok', agentVersion: '0.0.0', contentSchemaVersion: 4, sqliteDriver: 'node:sqlite' },
};

function installFakeApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 });
      }
      if (url === '/api/sites') {
        return new Response(JSON.stringify([SITE]), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    }),
  );
}

function renderShell(initialEntry: string) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<div>home content</div>} />
              <Route path="/sites/:siteId/content" element={<div>pages content</div>} />
              <Route path="/sites/:siteId/menus" element={<div>menus content</div>} />
              <Route path="/sites/:siteId/media" element={<div>media content</div>} />
              <Route path="/sites/:siteId/redirects" element={<div>redirects content</div>} />
              <Route path="/sites/:siteId/history" element={<div>history content</div>} />
              <Route path="/sites/:siteId/editor" element={<div>editor content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

// GET /me returns name/email alongside id/username (widened when the
// account popover started needing them) - the popover tests need a
// profile with both set, not the bare id/username shape the other
// tests here get away with using since they never open the popover.
function installFakeApiWithProfile() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/auth/me') {
      return new Response(
        JSON.stringify({ id: 'admin', username: 'admin', name: 'Ada Admin', email: 'ada@example.com' }),
        { status: 200 },
      );
    }
    if (url === '/api/sites') {
      return new Response(JSON.stringify([SITE]), { status: 200 });
    }
    if (url === '/api/auth/logout' && init?.method === 'POST') {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('renders all five top-bar nav items as real links once a site is selected', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');

    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Pages' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Menus' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Media' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Redirects' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'History' })).toBeDefined();
  });

  it('sees siteId via useParams and points Pages/Menus/Media/Redirects/History at the current site', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');

    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Pages' }).getAttribute('href')).toBe('/sites/site-1/content');
    expect(screen.getByRole('link', { name: 'Menus' }).getAttribute('href')).toBe('/sites/site-1/menus');
    expect(screen.getByRole('link', { name: 'Media' }).getAttribute('href')).toBe('/sites/site-1/media');
    expect(screen.getByRole('link', { name: 'Redirects' }).getAttribute('href')).toBe('/sites/site-1/redirects');
    // No query string - the bare route is the site-wide destination
    // (HistoryPage.tsx dispatches on presence/absence of ?path=).
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('href')).toBe('/sites/site-1/history');
  });

  it('highlights the active nav item via aria-current', async () => {
    installFakeApi();
    renderShell('/sites/site-1/menus');

    await waitFor(() => expect(screen.getByText('menus content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Menus' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Pages' }).getAttribute('aria-current')).toBeNull();
  });

  it('adds an active "Edit" item at the end of the nav only while a page is open in the editor', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');

    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
  });

  it('shows "Edit" as the active item, after History, when a page is open in the editor', async () => {
    installFakeApi();
    renderShell('/sites/site-1/editor?path=pages%2Findex.json&url=%2F');

    await waitFor(() => expect(screen.getByText('editor content')).toBeDefined());
    const editLink = screen.getByRole('link', { name: 'Edit' });
    expect(editLink.getAttribute('aria-current')).toBe('page');
    expect(editLink.getAttribute('href')).toBe('/sites/site-1/editor?path=pages%2Findex.json&url=%2F');

    const items = screen.getAllByRole('link').map((el) => el.textContent);
    expect(items.at(-1)).toBe('Edit');
  });

  it('disables Pages and Menus too when no site is selected (the registry, "/")', async () => {
    installFakeApi();
    renderShell('/');

    await waitFor(() => expect(screen.getByText('home content')).toBeDefined());
    expect(screen.getByTitle('Pages (unavailable)')).toBeDefined();
    expect(screen.getByTitle('Menus (unavailable)')).toBeDefined();
  });

  it('opening the avatar popover shows the account identity, the theme toggle, and Logout', async () => {
    installFakeApiWithProfile();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));

    expect(screen.getByText('Ada Admin')).toBeDefined();
    expect(screen.getByText('ada@example.com')).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Switch to light mode' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeDefined();
  });

  it('the theme toggle flips documentElement\'s data-theme and its own label, without logging out', async () => {
    const fetchMock = installFakeApiWithProfile();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));
    expect(document.documentElement.dataset.theme).toBe('dark');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch to light mode' }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('menuitem', { name: 'Switch to dark mode' })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
  });

  it('clicking outside the open popover closes it without logging out', async () => {
    const fetchMock = installFakeApiWithProfile();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeDefined();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menuitem', { name: 'Logout' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
  });

  it('the popover Logout button logs the user out', async () => {
    const fetchMock = installFakeApiWithProfile();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' }));
  });

  it('the hamburger toggles the mobile nav dropdown open and closed', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    const hamburger = screen.getByRole('button', { name: 'Open menu' });
    expect(hamburger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('navigation', { name: 'Primary' }).className).not.toContain('is-open');

    fireEvent.click(hamburger);

    expect(screen.getByRole('button', { name: 'Close menu' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('navigation', { name: 'Primary' }).className).toContain('is-open');

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expect(screen.getByRole('button', { name: 'Open menu' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('navigation', { name: 'Primary' }).className).not.toContain('is-open');
  });

  it('picking a nav item from the open mobile dropdown closes it', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('navigation', { name: 'Primary' }).className).toContain('is-open');

    fireEvent.click(screen.getByRole('link', { name: 'Menus' }));

    await waitFor(() => expect(screen.getByText('menus content')).toBeDefined());
    expect(screen.getByRole('navigation', { name: 'Primary' }).className).not.toContain('is-open');
  });
});
