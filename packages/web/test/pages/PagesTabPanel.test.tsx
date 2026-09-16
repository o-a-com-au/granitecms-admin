import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PagesTabPanel } from '../../src/pages/PagesTabPanel.tsx';
import { createFakeDataTransfer } from '../helpers/fakeDataTransfer.ts';

const ENTRY_ONE = {
  path: 'pages/about.json',
  name: 'About',
  title: 'About',
  type: 'page',
  published: true,
  hasDraft: false,
  url: '/about',
  changedAt: '2026-08-05T10:00:00.000Z',
};
const ENTRY_TWO = {
  path: 'pages/contact.json',
  name: 'Contact',
  title: 'Contact',
  type: 'page',
  published: false,
  hasDraft: true,
  url: '/contact',
  changedAt: null,
};
const MENU_ENTRY = {
  path: 'menus/main.json',
  name: 'Main menu',
  title: 'Main menu',
  type: 'menu',
  published: true,
  hasDraft: false,
  url: null,
  changedAt: null,
};
const PARENT_ENTRY = {
  path: 'pages/about.json',
  name: 'About',
  title: 'About',
  type: 'page',
  published: true,
  hasDraft: false,
  url: '/about',
  changedAt: null,
};
const CHILD_ENTRY = {
  path: 'pages/about/team.json',
  name: 'Team',
  title: 'Team',
  type: 'page',
  published: true,
  hasDraft: false,
  url: '/about/team',
  changedAt: null,
};

function renderPanel(onPreview = vi.fn(), activeUrl: string | null = null) {
  return {
    onPreview,
    ...render(
      <MemoryRouter initialEntries={['/sites/site-1/content']}>
        <Routes>
          <Route
            path="/sites/:siteId/content"
            element={<PagesTabPanel siteId="site-1" onPreview={onPreview} activeUrl={activeUrl} />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PagesTabPanel', () => {
  // Row controls collapsed into a single options menu, so an action is
  // only reachable once that menu is open. getAllByRole + [0] rather
  // than getByRole: a test listing more than one row renders a trigger
  // per row, and these all act on the first.
  function openRowActions(): void {
    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0] as HTMLElement);
  }

  it('lists each page by name only - Type/Status/Changed are dropped, no room for them in this narrow panel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());
    expect(screen.getByRole('button', { name: 'Contact' })).toBeDefined();
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByText('Page')).toBeNull();
  });

  it('shows "No pages found." for an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

    renderPanel();

    await waitFor(() => expect(screen.getByText('No pages found.')).toBeDefined());
  });

  it('each row\'s Edit button links straight to the editor route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 })));

    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());
    openRowActions();

    // Still a real anchor inside the menu - that is the whole point of
    // the action carrying `to` rather than an onClick.
    const link = await screen.findByRole('menuitem', { name: 'Edit Page' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
  });

  it('clicking a row\'s own title calls onPreview with that page\'s own path and url, without navigating away', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 })));
    const onPreview = vi.fn();

    renderPanel(onPreview);
    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'About' }));

    expect(onPreview).toHaveBeenCalledWith({ path: 'pages/about.json', url: '/about' });
  });

  it("highlights the row matching activeUrl blue (is-selected), the same treatment Sections uses for its own active instance", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPanel(vi.fn(), '/about');
    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

    expect(screen.getByRole('button', { name: 'About' }).className).toContain('is-selected');
    expect(screen.getByRole('button', { name: 'Contact' }).className).not.toContain('is-selected');
  });

  it('highlights nothing when activeUrl is null (no page currently previewed)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPanel(vi.fn(), null);
    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

    expect(screen.getByRole('button', { name: 'About' }).className).not.toContain('is-selected');
    expect(screen.getByRole('button', { name: 'Contact' }).className).not.toContain('is-selected');
  });

  it('marks an unpublished page (is-unpublished) and leaves a published one alone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

    // ENTRY_ONE (About) is published, ENTRY_TWO (Contact) is not.
    expect(screen.getByRole('button', { name: 'About' }).className).not.toContain('is-unpublished');
    expect(screen.getByRole('button', { name: 'Contact' }).className).toContain('is-unpublished');
  });

  it('shows a Draft badge on an unpublished page only, not on a published one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

    // ENTRY_ONE (About) is published, ENTRY_TWO (Contact) is not, so
    // exactly one badge exists in the whole list.
    const badges = screen.getAllByText('Draft');
    expect(badges).toHaveLength(1);
    // Uppercasing is CSS-only, so the accessible text stays "Draft".
    expect(screen.getByRole('button', { name: 'Contact' }).textContent).toContain('Draft');
    expect(screen.getByRole('button', { name: 'About' }).textContent).not.toContain('Draft');
  });

  it('excludes menus entirely - they live in the Menus tab instead', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, MENU_ENTRY]), { status: 200 })));

    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Main menu' })).toBeNull();
  });

  it('shows an "unreachable" message when the site cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x', reason: 'unreachable' }), { status: 502 })));

    renderPanel();

    await waitFor(() => expect(screen.getByText('This website is unreachable right now.')).toBeDefined());
  });

  it('nests a page under its matching parent directory stem, collapsed by default, and expands/collapses via the chevron', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([PARENT_ENTRY, CHILD_ENTRY]), { status: 200 })));

    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Team' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Expand About' }));
    expect(screen.getByRole('button', { name: 'Team' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse About' }));
    expect(screen.queryByRole('button', { name: 'Team' })).toBeNull();
  });

  describe('drag-and-drop reparenting', () => {
    function dragHandleFor(name: string): HTMLElement {
      return screen.getByRole('button', { name: `Drag to move ${name}` });
    }

    // Waits for the settled, collapsed-by-default state directly (not
    // just for the row to exist at all) before expanding it -
    // collapsedPaths starts empty and is only seeded to collapsed via a
    // follow-up effect once entries load, so a plain "+About exists"
    // check can resolve during that brief pre-seed window, when the
    // toggle's own accessible name is still "Collapse About" - found
    // live via real flakiness (~1 in 10 runs), not a hypothetical.
    async function expandAbout(): Promise<void> {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Expand About' })).toBeDefined());
      fireEvent.click(screen.getByRole('button', { name: 'Expand About' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Team' })).toBeDefined());
    }

    it('dragging a page onto another shows a confirmation naming the resulting path/url', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));
      renderPanel();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Contact' })).toBeDefined());

      fireEvent.dragStart(dragHandleFor('Contact'), { dataTransfer: createFakeDataTransfer() });
      fireEvent.dragOver(screen.getByRole('button', { name: 'About' }));
      fireEvent.drop(screen.getByRole('button', { name: 'About' }));

      expect(screen.getByRole('alertdialog')).toBeDefined();
      expect(
        screen.getByText('Move "Contact" under "About"? Its path becomes about/contact.json and its url becomes /about/contact.'),
      ).toBeDefined();
    });

    it('confirming the move calls the move API with createRedirect: true, then reloads the list', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/move')) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Contact' })).toBeDefined());

      fireEvent.dragStart(dragHandleFor('Contact'), { dataTransfer: createFakeDataTransfer() });
      fireEvent.dragOver(screen.getByRole('button', { name: 'About' }));
      fireEvent.drop(screen.getByRole('button', { name: 'About' }));
      fireEvent.click(screen.getByRole('button', { name: 'Move' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/sites/site-1/move',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ from: '/contact', to: '/about/contact', message: 'Move Contact under About', createRedirect: true }),
          }),
        ),
      );
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      // The list reloads after a successful move - the fake fetch above
      // always returns the same two root entries regardless of the
      // move having "happened" (jsdom doesn't actually run the agent),
      // so this just confirms a second /content fetch really occurred.
      expect(fetchMock.mock.calls.filter((call) => !String(call[0]).includes('/move')).length).toBeGreaterThan(1);
    });

    it('Cancel dismisses the confirmation without calling the move API', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Contact' })).toBeDefined());

      fireEvent.dragStart(dragHandleFor('Contact'), { dataTransfer: createFakeDataTransfer() });
      fireEvent.dragOver(screen.getByRole('button', { name: 'About' }));
      fireEvent.drop(screen.getByRole('button', { name: 'About' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/move'), expect.anything());
    });

    it('dropping a page onto itself is refused - no confirmation appears', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));
      renderPanel();
      await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

      fireEvent.dragStart(dragHandleFor('About'), { dataTransfer: createFakeDataTransfer() });
      fireEvent.dragOver(screen.getByRole('button', { name: 'About' }));
      fireEvent.drop(screen.getByRole('button', { name: 'About' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('dropping a page onto its own current descendant is refused - no confirmation appears', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([PARENT_ENTRY, CHILD_ENTRY]), { status: 200 })));
      renderPanel();
      await expandAbout();

      fireEvent.dragStart(dragHandleFor('About'), { dataTransfer: createFakeDataTransfer() });
      fireEvent.dragOver(screen.getByRole('button', { name: 'Team' }));
      fireEvent.drop(screen.getByRole('button', { name: 'Team' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it("dropping a page onto its own current parent is refused (nothing would change) - no confirmation appears", async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([PARENT_ENTRY, CHILD_ENTRY]), { status: 200 })));
      renderPanel();
      await expandAbout();

      fireEvent.dragStart(dragHandleFor('Team'), { dataTransfer: createFakeDataTransfer() });
      fireEvent.dragOver(screen.getByRole('button', { name: 'About' }));
      fireEvent.drop(screen.getByRole('button', { name: 'About' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });

  describe('delete', () => {
    it('clicking Delete shows a confirmation naming the page', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 })));
      renderPanel();
      await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

      openRowActions();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Page' }));

      expect(screen.getByRole('alertdialog')).toBeDefined();
      expect(screen.getByText('Delete "About"? This cannot be undone.')).toBeDefined();
    });

    it('a page with children gets an extra warning in the confirmation message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([PARENT_ENTRY, CHILD_ENTRY]), { status: 200 })));
      renderPanel();
      await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

      openRowActions();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Page' }));

      expect(
        screen.getByText(
          'Delete "About"? This cannot be undone. This page has child pages of its own, which must be deleted first.',
        ),
      ).toBeDefined();
    });

    it('confirming calls the delete API with a real message, then reloads the list', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify([ENTRY_ONE]), { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();
      await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

      openRowActions();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Page' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/sites/site-1/content/pages/about.json',
          expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ message: 'Delete About' }) }),
        ),
      );
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method !== 'DELETE').length).toBeGreaterThan(1);
    });

    it('Cancel dismisses the confirmation without calling the delete API', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();
      await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

      openRowActions();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Page' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));
    });

    it('a 409 (has-children) failure surfaces the site\'s own message, and the dialog stays open', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'DELETE') {
          return new Response(JSON.stringify({ message: '"pages/about.json" has child pages; delete them first' }), { status: 409 });
        }
        return new Response(JSON.stringify([ENTRY_ONE]), { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);
      renderPanel();
      await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

      openRowActions();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Page' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(screen.getByText('"pages/about.json" has child pages; delete them first')).toBeDefined());
      expect(screen.getByRole('alertdialog')).toBeDefined();
    });
  });

  it('the "Add Page" link opens the New Page modal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/theme/page-templates')) {
          return new Response(JSON.stringify({ templates: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([ENTRY_ONE]), { status: 200 });
      }),
    );

    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));

    expect(screen.getByRole('heading', { name: 'New Page' })).toBeDefined();
  });
});

// Discarding a draft on a page that was never published deletes it
// (the draft was the only copy), and publishing one flips its status -
// both change this list while it is on screen, but neither happens
// here: the header action bar above owns them (PagesHubPage.tsx wires
// its signal into this prop). Without the reload, the panel kept
// listing a page that no longer existed anywhere.
describe('PagesTabPanel: refreshToken', () => {
  function renderWithToken(refreshToken: number) {
    return render(
      <MemoryRouter initialEntries={['/sites/site-1/content']}>
        <Routes>
          <Route
            path="/sites/:siteId/content"
            element={<PagesTabPanel siteId="site-1" onPreview={vi.fn()} activeUrl={null} refreshToken={refreshToken} />}
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('reloads the list when the token changes, dropping a page that has since been deleted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderWithToken(0);
    expect(await screen.findAllByText('Contact')).not.toHaveLength(0);

    rerender(
      <MemoryRouter initialEntries={['/sites/site-1/content']}>
        <Routes>
          <Route
            path="/sites/:siteId/content"
            element={<PagesTabPanel siteId="site-1" onPreview={vi.fn()} activeUrl={null} refreshToken={1} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryAllByText('Contact')).toHaveLength(0));
    expect(screen.getAllByText('About')).not.toHaveLength(0);
  });

  it('does not reload on every render, only when the token actually changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderWithToken(3);
    expect(await screen.findAllByText('About')).not.toHaveLength(0);
    const callsAfterLoad = fetchMock.mock.calls.length;

    rerender(
      <MemoryRouter initialEntries={['/sites/site-1/content']}>
        <Routes>
          <Route
            path="/sites/:siteId/content"
            element={<PagesTabPanel siteId="site-1" onPreview={vi.fn()} activeUrl={null} refreshToken={3} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(fetchMock.mock.calls.length).toBe(callsAfterLoad);
  });
});

// Publish / Set as Draft. Which one a row offers is decided by its own
// published flag, and "Publish" deliberately takes two different routes
// depending on whether the page has ever been published at all.
describe('PagesTabPanel: publish and set as draft', () => {
  function installStatusFetch(options: { hasLive: boolean }) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (method === 'GET' && url.includes('source=live')) {
        return new Response(JSON.stringify({ exists: options.hasLive }), { status: 200 });
      }
      // A single page read (never-published branch) - distinguished from
      // the list call by the trailing slash after /content.
      if (method === 'GET' && url.includes('/content/')) {
        return new Response(JSON.stringify({ title: 'Contact', published: false }), {
          status: 200,
          headers: { etag: '"1"', 'x-content-source': 'draft' },
        });
      }
      if (method === 'GET') {
        return new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"2"' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function openRowMenu(index: number): void {
    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[index] as HTMLElement);
  }

  it('offers Set as Draft on a published page and Publish on an unpublished one', async () => {
    installStatusFetch({ hasLive: true });
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

    // ENTRY_ONE (About) is published, ENTRY_TWO (Contact) is not.
    openRowMenu(0);
    expect(screen.getByText('Set as Draft')).toBeTruthy();
    expect(screen.queryByText('Publish')).toBeNull();
  });

  it('offers Publish, not Set as Draft, on an unpublished page', async () => {
    installStatusFetch({ hasLive: true });
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Contact' })).toBeDefined());

    openRowMenu(1);
    expect(screen.getByText('Publish')).toBeTruthy();
    expect(screen.queryByText('Set as Draft')).toBeNull();
  });

  it('publishing a page that already has a live version flips the flag in place, never promoting a draft', async () => {
    const fetchMock = installStatusFetch({ hasLive: true });
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Contact' })).toBeDefined());

    openRowMenu(1);
    fireEvent.click(screen.getByText('Publish'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/publish-page/'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    // The draft-promoting route must not be involved at all here: it
    // would push any unrelated pending edits live with the flag.
    const promoted = fetchMock.mock.calls.some(([url]) => String(url).endsWith('/publish'));
    expect(promoted).toBe(false);
  });

  it('publishing a page that has never been published sets the flag in its draft, then promotes it', async () => {
    const fetchMock = installStatusFetch({ hasLive: false });
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Contact' })).toBeDefined());

    openRowMenu(1);
    fireEvent.click(screen.getByText('Publish'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    // Saved with published flipped on, so promoting it actually makes
    // the page visible rather than live-but-hidden.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/drafts/'), expect.objectContaining({ method: 'PUT' })),
    );
    const savedBody = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    )?.[1] as RequestInit;
    // saveSiteDraft sends the page JSON as the raw request body, with the
    // prior ETag in If-Match - there is no {content} wrapper around it.
    expect(String(savedBody.body)).toContain('"published": true');
    expect((savedBody.headers as Record<string, string>)['If-Match']).toBe('"1"');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/publish'), expect.objectContaining({ method: 'POST' })),
    );
  });

  it('setting a published page as a draft calls unpublish', async () => {
    const fetchMock = installStatusFetch({ hasLive: true });
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

    openRowMenu(0);
    fireEvent.click(screen.getByText('Set as Draft'));
    fireEvent.click(screen.getByRole('button', { name: 'Set as Draft' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/unpublish/'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});
