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

    const link = await screen.findByRole('link', { name: 'Edit About' });
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
