import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { ThemeProvider } from '../../src/theme/ThemeContext.tsx';
import { AppShell } from '../../src/layout/AppShell.tsx';
import { defaultEditorHref, readLastSiteId } from '../../src/sites/currentSite.ts';
import { createFakeStorage } from '../helpers/fakeStorage.ts';

const SITE = {
  id: 'site-1',
  url: 'http://localhost:3891',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: { state: 'ok', agentVersion: '0.0.0', contentSchemaVersion: 4, sqliteDriver: 'node:sqlite' },
};

const SITE_2 = {
  id: 'site-2',
  url: 'https://other.example.com',
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
              <Route path="/settings" element={<div>settings content</div>} />
              <Route path="/sites/:siteId/content" element={<div>pages content</div>} />
              <Route path="/sites/:siteId/menus" element={<div>menus content</div>} />
              <Route path="/sites/:siteId/media" element={<div>media content</div>} />
              <Route path="/sites/:siteId/redirects" element={<div>redirects content</div>} />
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

function installFakeApiWithTwoSites() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/auth/me') {
      return new Response(
        JSON.stringify({ id: 'admin', username: 'admin', name: 'Ada Admin', email: 'ada@example.com' }),
        { status: 200 },
      );
    }
    if (url === '/api/sites') {
      return new Response(JSON.stringify([SITE, SITE_2]), { status: 200 });
    }
    throw new Error(`unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// GET /api/sites never resolves until resolveSites() is called - lets a
// test observe the popover's own loading state before the list arrives.
function installFakeApiWithDelayedSites() {
  let resolveSites: (sites: Array<typeof SITE>) => void = () => {};
  const sitesPromise = new Promise<Array<typeof SITE>>((resolve) => {
    resolveSites = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(
          JSON.stringify({ id: 'admin', username: 'admin', name: 'Ada Admin', email: 'ada@example.com' }),
          { status: 200 },
        );
      }
      if (url === '/api/sites') {
        const sites = await sitesPromise;
        return new Response(JSON.stringify(sites), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    }),
  );
  return { resolveSites };
}

function installFakeApiWithSitesError() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(
          JSON.stringify({ id: 'admin', username: 'admin', name: 'Ada Admin', email: 'ada@example.com' }),
          { status: 200 },
        );
      }
      if (url === '/api/sites') {
        return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('renders all four top-bar nav items, with no History item - history is reached per-page from the editor now', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');

    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Pages' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Menus' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Media' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Redirects' })).toBeDefined();
    expect(screen.queryByText('History')).toBeNull();
  });

  it('sees siteId via useParams and points Pages/Menus/Media/Redirects at the current site', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');

    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Pages' }).getAttribute('href')).toBe('/sites/site-1/content');
    expect(screen.getByRole('link', { name: 'Menus' }).getAttribute('href')).toBe('/sites/site-1/menus');
    expect(screen.getByRole('link', { name: 'Media' }).getAttribute('href')).toBe('/sites/site-1/media');
    expect(screen.getByRole('link', { name: 'Redirects' }).getAttribute('href')).toBe('/sites/site-1/redirects');
  });

  it('highlights the active nav item via aria-current', async () => {
    installFakeApi();
    renderShell('/sites/site-1/menus');

    await waitFor(() => expect(screen.getByText('menus content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Menus' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Pages' }).getAttribute('aria-current')).toBeNull();
  });

  it('shows "Editor" as a real, enabled link (not active) once a site is known but has no remembered page yet', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');

    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());
    const editorLink = screen.getByRole('link', { name: 'Editor' });
    expect(editorLink.getAttribute('href')).toBe(defaultEditorHref('site-1'));
    expect(editorLink.getAttribute('aria-current')).toBeNull();
  });

  it('shows "Editor" as the active, first item when a page is open in the editor', async () => {
    installFakeApi();
    renderShell('/sites/site-1/editor?path=pages%2Findex.json&url=%2F');

    await waitFor(() => expect(screen.getByText('editor content')).toBeDefined());
    const editLink = screen.getByRole('link', { name: 'Editor' });
    expect(editLink.getAttribute('aria-current')).toBe('page');
    expect(editLink.getAttribute('href')).toBe('/sites/site-1/editor?path=pages%2Findex.json&url=%2F');

    // Scoped to the primary nav, not screen.getAllByRole('link') - the
    // logo is also a link and precedes it in the DOM, which would
    // otherwise make this assertion pass or fail for the wrong reason.
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const items = within(nav).getAllByRole('link').map((el) => el.textContent);
    expect(items.at(0)).toBe('Editor');
  });

  it('disables Pages, Menus, and Editor too when no site is known at all (a genuine first-ever visit)', async () => {
    installFakeApi();
    renderShell('/settings');

    await waitFor(() => expect(screen.getByText('settings content')).toBeDefined());
    expect(screen.getByTitle('Pages (unavailable)')).toBeDefined();
    expect(screen.getByTitle('Menus (unavailable)')).toBeDefined();
    expect(screen.getByTitle('Editor (unavailable)')).toBeDefined();
  });

  it('Editor falls back to a locally-remembered site when siteId itself is unset (e.g. on /settings)', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    localStorage.setItem('cms-admin-last-site', 'site-1');
    installFakeApi();
    renderShell('/settings');

    await waitFor(() => expect(screen.getByText('settings content')).toBeDefined());
    const editorLink = screen.getByRole('link', { name: 'Editor' });
    expect(editorLink.getAttribute('href')).toBe(defaultEditorHref('site-1'));
  });

  it('visiting a site-scoped route remembers that site as the current one', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeApi();
    renderShell('/sites/site-1/menus');

    await waitFor(() => expect(screen.getByText('menus content')).toBeDefined());
    expect(readLastSiteId()).toBe('site-1');
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

  it('"Switch site" shows the current site as inert and the other as a real link, and links to Site settings', async () => {
    installFakeApiWithTwoSites();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));

    await waitFor(() => expect(screen.getByText('other.example.com')).toBeDefined());
    expect(screen.getByText('Switch site')).toBeDefined();
    const current = screen.getByText('localhost:3891');
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');

    const other = screen.getByRole('menuitem', { name: 'other.example.com' });
    expect(other.getAttribute('href')).toBe('/sites/site-2/editor?path=pages%2Findex.json&url=%2F');

    const settingsLink = screen.getByRole('menuitem', { name: 'Site settings' });
    expect(settingsLink.getAttribute('href')).toBe('/settings');
  });

  it('clicking another site in "Switch site" navigates to it and closes the popover', async () => {
    installFakeApiWithTwoSites();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));
    await waitFor(() => expect(screen.getByText('other.example.com')).toBeDefined());

    fireEvent.click(screen.getByRole('menuitem', { name: 'other.example.com' }));

    expect(screen.queryByRole('menuitem', { name: 'Logout' })).toBeNull();
  });

  it('"Switch site" shows a muted loading row before the list arrives, without breaking the rest of the popover', async () => {
    installFakeApiWithDelayedSites();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));

    expect(screen.getByText('Loading sites...')).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeDefined();
  });

  it('"Switch site" shows a muted error row if the site list fails to load, without breaking the rest of the popover', async () => {
    installFakeApiWithSitesError();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));

    await waitFor(() => expect(screen.getByText('Couldn\'t load sites')).toBeDefined());
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeDefined();
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
