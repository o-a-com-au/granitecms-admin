import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { ThemeProvider } from '../../src/theme/ThemeContext.tsx';
import { AppShell } from '../../src/layout/AppShell.tsx';
import { usePreview, usePreviewVisible } from '../../src/layout/PreviewContext.tsx';
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
        JSON.stringify({
          id: 'admin',
          username: 'admin',
          firstName: 'Ada',
          lastName: 'Admin',
          email: 'ada@example.com',
          role: 'developer',
          status: 'active',
        }),
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
        JSON.stringify({
          id: 'admin',
          username: 'admin',
          firstName: 'Ada',
          lastName: 'Admin',
          email: 'ada@example.com',
          role: 'developer',
          status: 'active',
        }),
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
          JSON.stringify({
            id: 'admin',
            username: 'admin',
            firstName: 'Ada',
          lastName: 'Admin',
            email: 'ada@example.com',
            role: 'developer',
            status: 'active',
          }),
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
          JSON.stringify({
            id: 'admin',
            username: 'admin',
            firstName: 'Ada',
          lastName: 'Admin',
            email: 'ada@example.com',
            role: 'developer',
            status: 'active',
          }),
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

function installFakeApiWithClientProfile() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/auth/me') {
      return new Response(
        JSON.stringify({
          id: 'client-1',
          username: 'client-1',
          firstName: 'Casey',
          lastName: 'Client',
          email: 'casey@example.com',
          role: 'client',
          status: 'active',
        }),
        { status: 200 },
      );
    }
    if (url === '/api/sites') {
      return new Response(JSON.stringify([SITE]), { status: 200 });
    }
    throw new Error(`unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Stands in for PageEditorPage's own setPreview({ url: previewUrl })
// call - a real page editor route drags in far more fetching/state
// than these wordmark tests care about, so this registers the one
// thing that actually matters to AppShell's own address bar (which now
// reads the same shared previewUrl the preview viewport itself shows,
// not a separate chrome slot).
function PagePathStub({ path }: { path: string | null }) {
  const { setPreview } = usePreview();
  useEffect(() => {
    setPreview({ url: path });
  }, [setPreview, path]);
  return <div>editor content</div>;
}

function renderShellWithPagePath(initialEntry: string, path: string | null) {
  installFakeApi();
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/sites/:siteId/editor" element={<PagePathStub path={path} />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

// Stands in for a route that wants the shared viewport (PageEditorPage,
// PagesHubPage, MediaLibraryPage) - registers visibility and a URL to
// preview, without dragging in any of those pages' own fetching/state.
function PreviewProbe({ url }: { url: string | null }) {
  usePreviewVisible(true);
  const { setPreview } = usePreview();
  useEffect(() => {
    setPreview({ url });
  }, [setPreview, url]);
  return <div>probe content</div>;
}

function renderShellWithPreviewProbe(initialEntry: string, url: string | null) {
  installFakeApi();
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/sites/:siteId/content" element={<PreviewProbe url={url} />} />
              <Route path="/settings" element={<div>settings content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('renders exactly the three icon-rail nav items - Menus/Redirects live inside Pages\' own tabs now', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');

    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Editor' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Pages' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Media' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Menus' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Redirects' })).toBeNull();
    expect(screen.queryByText('History')).toBeNull();
  });

  it('sees siteId via useParams and points Pages/Media at the current site', async () => {
    installFakeApi();
    renderShell('/sites/site-1/content');

    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Pages' }).getAttribute('href')).toBe('/sites/site-1/content');
    expect(screen.getByRole('link', { name: 'Media' }).getAttribute('href')).toBe('/sites/site-1/media');
  });

  it('highlights the active nav item via aria-current', async () => {
    installFakeApi();
    renderShell('/sites/site-1/media');

    await waitFor(() => expect(screen.getByText('media content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Media' }).getAttribute('aria-current')).toBe('page');
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

  it('shows "Editor" as the active item when a page is open in the editor, after Pages in the rail order', async () => {
    installFakeApi();
    renderShell('/sites/site-1/editor?path=pages%2Findex.json&url=%2F');

    await waitFor(() => expect(screen.getByText('editor content')).toBeDefined());
    const editLink = screen.getByRole('link', { name: 'Editor' });
    expect(editLink.getAttribute('aria-current')).toBe('page');
    expect(editLink.getAttribute('href')).toBe('/sites/site-1/editor?path=pages%2Findex.json&url=%2F');

    // Scoped to the primary nav, not screen.getAllByRole('link') - the
    // logo is also a link and precedes it in the DOM, which would
    // otherwise make this assertion pass or fail for the wrong reason.
    // Pages first, then Editor, then Media - IconRail.tsx's own order.
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const items = within(nav).getAllByRole('link').map((el) => el.textContent);
    expect(items).toEqual(['Pages', 'Editor', 'Media']);
  });

  it('disables Pages, Media, and Editor too when no site is known at all (a genuine first-ever visit)', async () => {
    installFakeApi();
    renderShell('/settings');

    await waitFor(() => expect(screen.getByText('settings content')).toBeDefined());
    expect(screen.getByTitle('Pages (unavailable)')).toBeDefined();
    expect(screen.getByTitle('Media (unavailable)')).toBeDefined();
    expect(screen.getByTitle('Editor (unavailable)')).toBeDefined();
  });

  it('renders no nav items at all - not even disabled ones - when the registry itself has zero sites', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 });
        }
        if (url === '/api/sites') {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );
    renderShell('/settings');

    await waitFor(() => expect(screen.getByText('settings content')).toBeDefined());
    // The rail itself doesn't mount at all (unlike the old top-bar nav,
    // it isn't load-bearing for the account avatar's own position -
    // that pins via .app-topbar-end's margin-left: auto regardless).
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(screen.queryByTitle('Pages (unavailable)')).toBeNull();
    expect(screen.queryByTitle('Media (unavailable)')).toBeNull();
    expect(screen.queryByTitle('Editor (unavailable)')).toBeNull();
  });

  // The actual bug this covers: AppShell is the persistent layout - it
  // never remounts on in-app navigation, so its own useSites() call
  // only ever fetched once, on mount. Registering a brand new first
  // site happens entirely inside OnboardingPage.tsx, a separate
  // component with no way to reach back into this one, so without a
  // refresh triggered here too, the nav stayed hidden (registry still
  // looked empty to THIS shell) even after landing on a real site's
  // editor - only a full reload (a fresh AppShell mount) picked it up.
  it('picks up a brand new site and shows the nav once navigation lands on its editor, without needing a reload', async () => {
    let registered = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 });
        }
        if (url === '/api/sites') {
          return new Response(JSON.stringify(registered ? [SITE] : []), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    function OnboardingStandIn() {
      const navigate = useNavigate();
      return (
        <button
          type="button"
          onClick={() => {
            // The real registration call happens in OnboardingPage.tsx
            // itself, well before this shell is ever involved - only
            // the "a site now exists, then navigate into it" sequence
            // matters here.
            registered = true;
            navigate('/sites/site-1/editor');
          }}
        >
          register
        </button>
      );
    }

    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/onboarding']}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/onboarding" element={<OnboardingStandIn />} />
                <Route path="/sites/:siteId/editor" element={<div>editor content</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'register' })).toBeDefined());
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'register' }));

    await waitFor(() => expect(screen.getByText('editor content')).toBeDefined());
    await waitFor(() =>
      expect(within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole('link').length).toBeGreaterThan(0),
    );
  });

  it('Editor, Pages, and Media all fall back to a locally-remembered site when siteId itself is unset (e.g. on /settings)', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    localStorage.setItem('cms-admin-last-site', 'site-1');
    installFakeApi();
    renderShell('/settings');

    await waitFor(() => expect(screen.getByText('settings content')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Editor' }).getAttribute('href')).toBe(defaultEditorHref('site-1'));
    expect(screen.getByRole('link', { name: 'Pages' }).getAttribute('href')).toBe('/sites/site-1/content');
    expect(screen.getByRole('link', { name: 'Media' }).getAttribute('href')).toBe('/sites/site-1/media');
  });

  it('visiting a site-scoped route remembers that site as the current one', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeApi();
    renderShell('/sites/site-1/media');

    await waitFor(() => expect(screen.getByText('media content')).toBeDefined());
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

  it('with only one site, "Switch website" shows it as plain, non-interactive text, not a dropdown', async () => {
    installFakeApiWithProfile();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));

    expect(screen.getByText('Switch website')).toBeDefined();
    // Scoped to the popover row specifically, not a bare getByText -
    // the top bar's own wordmark (AppShell.tsx) now shows this same
    // site's address too, once it's the current site.
    const current = screen.getByText('localhost:3891', { selector: '.account-popover-item' });
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('combobox', { name: 'Switch website' })).toBeNull();
  });

  it('with more than one site, "Switch website" renders as a dropdown listing every site, selected on the current one', async () => {
    installFakeApiWithTwoSites();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));

    const select = await screen.findByRole('combobox', { name: 'Switch website' });
    expect((select as HTMLSelectElement).value).toBe('site-1');
    const optionLabels = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(optionLabels).toEqual(['localhost:3891', 'other.example.com']);
    // The plain non-interactive current-site span only ever renders in
    // the single-site case above - scoped to the popover row here too,
    // since the top bar's own wordmark span (AppShell.tsx) legitimately
    // shows this same text regardless of how many sites are registered.
    expect(screen.queryByText('localhost:3891', { selector: '.account-popover-item' })).toBeNull();
  });

  it('picking another site from the "Switch website" dropdown navigates to it and closes the popover', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeApiWithTwoSites();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));
    const select = await screen.findByRole('combobox', { name: 'Switch website' });

    fireEvent.change(select, { target: { value: 'site-2' } });

    await waitFor(() => expect(readLastSiteId()).toBe('site-2'));
    expect(screen.queryByRole('menuitem', { name: 'Logout' })).toBeNull();
  });

  it('"Switch website" shows a muted loading row before the list arrives, without breaking the rest of the popover', async () => {
    installFakeApiWithDelayedSites();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));

    expect(screen.getByText('Loading websites...')).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeDefined();
  });

  it('"Switch website" shows a muted error row if the site list fails to load, without breaking the rest of the popover', async () => {
    installFakeApiWithSitesError();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));

    await waitFor(() => expect(screen.getByText('Couldn\'t load websites')).toBeDefined());
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeDefined();
  });

  it('a developer sees the "Account Settings" popover item, pointing at /settings/personal', async () => {
    installFakeApiWithProfile();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('admin'));

    const link = screen.getByRole('menuitem', { name: 'Account Settings' });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/settings/personal');
  });

  it('a client also sees the "Account Settings" popover item - reaching Manage Websites is developer-only, this link is not', async () => {
    installFakeApiWithClientProfile();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    fireEvent.click(screen.getByTitle('client-1'));

    const link = screen.getByRole('menuitem', { name: 'Account Settings' });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/settings/personal');
  });

  it('shows the plain brand mark in the logo slot, and "No website selected" in the address bar, on a route with no site in the URL', async () => {
    installFakeApi();

    renderShell('/');
    await waitFor(() => expect(screen.getByText('home content')).toBeDefined());

    expect(screen.getByText('GRANITE')).toBeDefined();
    expect(screen.getByText('No website selected', { selector: '.app-address-bar-label' })).toBeDefined();
    expect(screen.queryByText('localhost:3891', { selector: '.app-address-bar-label' })).toBeNull();
    expect(screen.queryByRole('link', { name: /open .* in a new tab/i })).toBeNull();
  });

  it('shows the current site\'s own domain in the address bar, alongside the brand mark (not instead of it), with a link to the live site', async () => {
    installFakeApi();

    renderShell('/sites/site-1/content');
    await waitFor(() => expect(screen.getByText('pages content')).toBeDefined());

    expect(screen.getByText('localhost:3891', { selector: '.app-address-bar-label' })).toBeDefined();
    // GRANITE is a fixed part of the logo slot now, not a fallback that
    // only shows when there's no site address to display instead.
    expect(screen.getByText('GRANITE')).toBeDefined();
    const externalLink = screen.getByRole('link', { name: 'Open localhost:3891 in a new tab' });
    expect(externalLink.getAttribute('href')).toBe('http://localhost:3891');
    expect(externalLink.getAttribute('target')).toBe('_blank');
  });

  it('appends the currently open page\'s own path once the editor registers one, joined onto the site\'s domain', async () => {
    renderShellWithPagePath('/sites/site-1/editor', '/what-we-stand-for');
    await waitFor(() => expect(screen.getByText('editor content')).toBeDefined());

    expect(screen.getByText('localhost:3891/what-we-stand-for', { selector: '.app-address-bar-label' })).toBeDefined();
    const externalLink = screen.getByRole('link', { name: 'Open localhost:3891/what-we-stand-for in a new tab' });
    expect(externalLink.getAttribute('href')).toBe('http://localhost:3891/what-we-stand-for');
  });

  it('shows the bare domain, with no trailing slash, when the open page\'s own path is the site root', async () => {
    renderShellWithPagePath('/sites/site-1/editor', '/');
    await waitFor(() => expect(screen.getByText('editor content')).toBeDefined());

    expect(screen.getByText('localhost:3891', { selector: '.app-address-bar-label' })).toBeDefined();
  });

  it('falls back to the domain alone while the editor has no live preview for the open content type (path is null)', async () => {
    renderShellWithPagePath('/sites/site-1/editor', null);
    await waitFor(() => expect(screen.getByText('editor content')).toBeDefined());

    expect(screen.getByText('localhost:3891', { selector: '.app-address-bar-label' })).toBeDefined();
  });
});

describe('AppShell shared preview region', () => {
  it('renders the shared viewport once a route registers itself visible, showing the URL it pushed', async () => {
    renderShellWithPreviewProbe('/sites/site-1/content', '/about');

    await waitFor(() => expect(screen.getByText('probe content')).toBeDefined());
    await waitFor(() => expect(screen.getByTitle('Live preview')).toBeDefined());
    expect(screen.getByTitle('Live preview').getAttribute('src')).toContain('/api/sites/site-1/preview/about');
  });

  it('stays hidden on a route that never asks for it', async () => {
    renderShellWithPreviewProbe('/settings', null);

    await waitFor(() => expect(screen.getByText('settings content')).toBeDefined());
    expect(screen.queryByTitle('Live preview')).toBeNull();
  });

  // toSiteLoadError (AppShell.tsx) drives this from the site registry
  // itself, not from any one route's own content fetch - so it applies
  // uniformly whether the mounted route is PreviewProbe here, or the
  // real PageEditorPage/PagesHubPage/MediaLibraryPage. Regression cases
  // for the bug found live 2026-08-31: a site removed out from under an
  // open tab showed a raw JSON 404 inside the iframe instead of the
  // same graceful panel every other site-scoped screen already had.
  it('shows a graceful "site not found" panel instead of the iframe when the current site is no longer registered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 });
        }
        if (url === '/api/sites') {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );
    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/sites/site-1/content']}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/sites/:siteId/content" element={<PreviewProbe url="/about" />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText('probe content')).toBeDefined());
    await waitFor(() => expect(screen.getByText('This website could not be found. It may have been removed.')).toBeDefined());
    expect(screen.queryByTitle('Live preview')).toBeNull();
    expect(screen.getByRole('link', { name: 'Manage Websites' })).toBeDefined();
  });

  it('shows a graceful "unreachable" panel (with Retry) instead of the iframe when the site itself is down', async () => {
    const unreachableSite = { ...SITE, status: { state: 'unreachable', message: 'Could not reach the site' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify({ id: 'admin', username: 'admin' }), { status: 200 });
        }
        if (url === '/api/sites') {
          return new Response(JSON.stringify([unreachableSite]), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );
    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/sites/site-1/content']}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/sites/:siteId/content" element={<PreviewProbe url="/about" />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText('probe content')).toBeDefined());
    await waitFor(() => expect(screen.getByText('This website is unreachable right now.')).toBeDefined());
    expect(screen.queryByTitle('Live preview')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });
});
