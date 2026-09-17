import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { NewPageModal } from '../../src/pages/NewPageModal.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderModal(onClose = vi.fn(), duplicateFrom?: { path: string; name: string; type?: string }) {
  // The dialog reports the created page rather than navigating to it -
  // the caller stays on the Pages panel and reveals the new row.
  const onCreated = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: '/sites/:siteId/content',
        element: (
          <NewPageModal
            siteId="site-1"
            onClose={onClose}
            onCreated={onCreated}
            duplicateFrom={duplicateFrom === undefined ? undefined : pageEntry(duplicateFrom.path, duplicateFrom.name, duplicateFrom.type)}
          />
        ),
      },
      { path: '/sites/:siteId/editor', element: <div>editor placeholder</div> },
    ],
    { initialEntries: ['/sites/site-1/content'] },
  );
  return { router, onClose, onCreated, ...render(<RouterProvider router={router} />) };
}

const TEMPLATE = {
  id: 'blog-article',
  title: 'Blog Article',
  content: {
    schemaVersion: 1,
    name: 'old-name',
    title: 'Old Title',
    type: 'page',
    layout: 'blog',
    published: true,
    sections: [{ id: 'sec-1', type: 'hero', settings: { heading: 'Hi' } }],
  },
};

function pageEntry(path: string, name: string, type = 'page') {
  return { path, name, title: name, type, published: true, hasDraft: false, url: null, changedAt: null };
}

const PAGES = [
  pageEntry('pages/index.json', 'Home'),
  pageEntry('pages/404.json', 'Not Found'),
  pageEntry('pages/about.json', 'About'),
];

function installFakeFetch({
  templates = [] as unknown[],
  pages = PAGES as unknown[],
  saveStatus = 200,
}: { templates?: unknown[]; pages?: unknown[]; saveStatus?: number } = {}) {
  let receivedSaveBody: unknown;
  let receivedSavePath: string | undefined;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/theme/page-templates')) {
      return new Response(JSON.stringify({ templates }), { status: 200 });
    }
    if (url.includes('/drafts/')) {
      receivedSavePath = url;
      receivedSaveBody = JSON.parse(init?.body as string);
      if (saveStatus !== 200) {
        return new Response(JSON.stringify({ message: 'A page already exists at that path' }), { status: saveStatus });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"abc"' } });
    }
    // A single page read, checked before the list below because the
    // list URL is a prefix of it. Duplicating calls this, and
    // readSiteEditorContent rejects any response without both headers -
    // without this branch a duplicate silently fails to create, which
    // surfaces only as a timed-out wait.
    if (url.includes('/content/')) {
      return new Response(
        JSON.stringify({
          schemaVersion: 6,
          name: 'Source',
          title: 'Source',
          type: 'page',
          layout: 'theme',
          published: true,
          sections: [],
        }),
        { status: 200, headers: { etag: '"src"', 'x-content-source': 'live' } },
      );
    }
    if (url.includes('/content')) {
      return new Response(JSON.stringify(pages), { status: 200 });
    }
    throw new Error(`unhandled fetch in test: ${url} ${init?.method as string}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, getReceivedSaveBody: () => receivedSaveBody, getReceivedSavePath: () => receivedSavePath };
}

// The Parent dropdown is the slowest of the modal's two loads, so
// every test waits on it rather than on the form itself - the fields
// render immediately, but "None" plus the real pages only appear once
// the content list resolves.
async function waitForParentOptions(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('option', { name: 'About' })).toBeDefined());
}

describe('NewPageModal', () => {
  it('is one step: title, parent, and no slug or path field to fill in', async () => {
    installFakeFetch();
    renderModal();
    await waitForParentOptions();

    expect(screen.getByLabelText('Title')).toBeDefined();
    expect(screen.getByLabelText('Parent')).toBeDefined();
    expect(screen.queryByLabelText('Path')).toBeNull();
    expect(screen.queryByLabelText('Slug')).toBeNull();
    // No template grid to pick from first any more.
    expect(screen.queryByRole('button', { name: 'Blank' })).toBeNull();
  });

  it('hides the Template dropdown when the theme declares no templates', async () => {
    installFakeFetch({ templates: [] });
    renderModal();
    await waitForParentOptions();

    expect(screen.queryByLabelText('Template')).toBeNull();
  });

  it('shows the Template dropdown, defaulting to Blank, once a template exists', async () => {
    installFakeFetch({ templates: [TEMPLATE] });
    renderModal();
    await waitForParentOptions();

    const select = screen.getByLabelText('Template') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: 'Blank' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Blog Article' })).toBeDefined();
  });

  it('offers None by default as the parent, and never Home or 404', async () => {
    installFakeFetch();
    renderModal();
    await waitForParentOptions();

    const select = screen.getByLabelText('Parent') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: 'None' })).toBeDefined();
    expect(screen.queryByRole('option', { name: 'Home' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Not Found' })).toBeNull();
  });

  it('offers a page whose content type is not "page" - type is not a parent filter', async () => {
    // Regression: this dropdown used to request { type: 'page' }, which
    // silently hid every page a site types differently (demo-architecture
    // types its project pages "project") while the Pages tree beside it
    // listed them - a page you could see but could not nest under.
    installFakeFetch({
      pages: [pageEntry('pages/about.json', 'About'), pageEntry('pages/projects/barwon.json', 'Barwon Shelter', 'project')],
    });
    renderModal();
    await waitForParentOptions();

    expect(screen.getByRole('option', { name: 'Barwon Shelter' })).toBeDefined();
  });

  it('still excludes menus, which share this same content listing', async () => {
    // The old type filter dropped these incidentally; the pages/ prefix
    // filter that replaced it has to keep doing so deliberately.
    installFakeFetch({
      pages: [
        pageEntry('pages/about.json', 'About'),
        { path: 'menus/main.json', name: 'Main Menu', title: 'Main Menu', type: 'menu', published: true, hasDraft: false, url: null, changedAt: null },
      ],
    });
    renderModal();
    await waitForParentOptions();

    expect(screen.queryByRole('option', { name: 'Main Menu' })).toBeNull();
  });

  it('derives the slug from the title and creates a top-level page', async () => {
    const { getReceivedSaveBody, getReceivedSavePath } = installFakeFetch();
    const { router, onCreated } = renderModal();
    await waitForParentOptions();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My New Page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('pages/my-new-page.json', '/my-new-page'));
    // saveSiteDraft encodes each path segment separately and rejoins
    // with '/', so the slashes survive in the request URL.
    expect(getReceivedSavePath()).toContain('/drafts/pages/my-new-page.json');
    expect(router.state.location.pathname).toBe('/sites/site-1/content');
    expect(getReceivedSaveBody()).toEqual({
      schemaVersion: 6,
      name: 'My New Page',
      title: 'My New Page',
      type: 'page',
      layout: 'theme',
      published: false,
      sections: [],
    });
  });

  it('nests the new page under the chosen parent, path and url alike', async () => {
    const { getReceivedSavePath } = installFakeFetch();
    const { router, onCreated } = renderModal();
    await waitForParentOptions();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Our Team' } });
    fireEvent.change(screen.getByLabelText('Parent'), { target: { value: 'pages/about.json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('pages/about/our-team.json', '/about/our-team'));
    expect(getReceivedSavePath()).toContain('/drafts/pages/about/our-team.json');
    expect(router.state.location.pathname).toBe('/sites/site-1/content');
  });

  it('creates from a chosen template - sections/layout kept, name/title/schemaVersion/published overridden', async () => {
    const { getReceivedSaveBody } = installFakeFetch({ templates: [TEMPLATE] });
    const { router, onCreated } = renderModal();
    await waitForParentOptions();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Post' } });
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'blog-article' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(router.state.location.pathname).toBe('/sites/site-1/content');
    expect(getReceivedSaveBody()).toEqual({
      schemaVersion: 6,
      name: 'My Post',
      title: 'My Post',
      type: 'page',
      layout: 'blog',
      published: false,
      sections: [{ id: 'sec-1', type: 'hero', settings: { heading: 'Hi' } }],
    });
  });

  it('cannot be submitted until a title gives it a slug', async () => {
    installFakeFetch();
    renderModal();
    await waitForParentOptions();

    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);

    // Punctuation alone slugifies to nothing, so it still leaves no path.
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '!!!' } });
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Real Title' } });
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('still offers None when the page list fails to load, so a top-level page can always be created', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/theme/page-templates')) {
        return new Response(JSON.stringify({ templates: [] }), { status: 200 });
      }
      if (url.includes('/content')) {
        return new Response(JSON.stringify({ message: 'nope' }), { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"abc"' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderModal();

    await waitFor(() => expect(screen.getByRole('option', { name: 'None' })).toBeDefined());
    expect(screen.queryByRole('option', { name: 'About' })).toBeNull();
  });

  it('shows a real conflict message and does not navigate when the path already exists', async () => {
    installFakeFetch({ saveStatus: 409 });
    const { router } = renderModal();
    await waitForParentOptions();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('A page already exists at that path')).toBeDefined());
    expect(router.state.location.pathname).toBe('/sites/site-1/content');
  });

  describe('status and duplication', () => {
    const SOURCE = {
      schemaVersion: 4,
      name: 'Team',
      title: 'Team',
      type: 'page',
      layout: 'wide',
      published: true,
      sections: [{ id: 'sec-1', type: 'hero', settings: { heading: 'Hi' } }],
    };

    // A fake per URL, building a fresh Response each call: duplicating
    // reads a single page (which needs real etag/x-content-source
    // headers) as well as listing pages, and installFakeFetch above
    // serves the list for anything containing "/content".
    function installFetch({ publishStatus = 200 }: { publishStatus?: number } = {}) {
      const calls: { url: string; init?: RequestInit }[] = [];
      let savedBody: unknown;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          calls.push({ url, init });
          if (url.includes('/theme/page-templates')) {
            return new Response(JSON.stringify({ templates: [] }), { status: 200 });
          }
          if (url.includes('/publish')) {
            return new Response(publishStatus === 200 ? null : JSON.stringify({ message: 'publish exploded' }), {
              status: publishStatus,
            });
          }
          if (url.includes('/drafts/')) {
            savedBody = JSON.parse(init?.body as string);
            return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"abc"' } });
          }
          // A single page read, not the list - checked first because the
          // list URL is a prefix of this one.
          if (url.includes('/content/')) {
            return new Response(JSON.stringify(SOURCE), {
              status: 200,
              headers: { etag: '"src"', 'x-content-source': 'live' },
            });
          }
          if (url.includes('/content')) {
            return new Response(JSON.stringify([pageEntry('pages/about.json', 'About'), pageEntry('pages/about/team.json', 'Team')]), {
              status: 200,
            });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        }),
      );
      return { calls, getSavedBody: () => savedBody };
    }

    it('defaults Status to Draft, so creating something live is always deliberate', async () => {
      installFetch();
      renderModal();
      await waitFor(() => expect(screen.getByLabelText('Status')).toBeDefined());

      expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('draft');
    });

    it('choosing Published marks the page published and publishes the draft', async () => {
      const { calls, getSavedBody } = installFetch();
      const { router, onCreated } = renderModal();
      await waitFor(() => expect(screen.getByLabelText('Status')).toBeDefined());

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Live Page' } });
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'published' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(router.state.location.pathname).toBe('/sites/site-1/content');
      expect((getSavedBody() as { published: boolean }).published).toBe(true);
      // Both halves matter: the flag alone would leave it unreachable,
      // and publishing alone would ship it flagged unpublished.
      expect(calls.some((call) => call.url.includes('/publish'))).toBe(true);
    });

    it('a page left as Draft is never published', async () => {
      const { calls, getSavedBody } = installFetch();
      const { router, onCreated } = renderModal();
      await waitFor(() => expect(screen.getByLabelText('Status')).toBeDefined());

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Quiet Page' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(router.state.location.pathname).toBe('/sites/site-1/content');
      expect((getSavedBody() as { published: boolean }).published).toBe(false);
      expect(calls.some((call) => call.url.includes('/publish'))).toBe(false);
    });

    it('says the page was created when publishing fails, rather than implying nothing happened', async () => {
      installFetch({ publishStatus: 500 });
      const { router } = renderModal();
      await waitFor(() => expect(screen.getByLabelText('Status')).toBeDefined());

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Live Page' } });
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'published' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('created as a draft'));
      // The draft really does exist, so staying put is correct.
      expect(router.state.location.pathname).toBe('/sites/site-1/content');
    });

    it('duplicating prefills a distinct title, seeds the source\'s own parent, and hides Template', async () => {
      installFetch();
      renderModal(vi.fn(), { path: 'pages/about/team.json', name: 'Team' });
      await waitFor(() => expect(screen.getByRole('option', { name: 'About' })).toBeDefined());

      expect(screen.getByRole('heading', { name: 'Duplicate Page' })).toBeDefined();
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Team (Copy)');
      expect((screen.getByLabelText('Parent') as HTMLSelectElement).value).toBe('pages/about.json');
      expect(screen.queryByLabelText('Template')).toBeNull();
      expect(screen.getByRole('button', { name: 'Duplicate' })).toBeDefined();
    });

    it('duplicating copies the source content, overriding name/title/schemaVersion/published', async () => {
      const { getSavedBody } = installFetch();
      const { router, onCreated } = renderModal(vi.fn(), { path: 'pages/about/team.json', name: 'Team' });
      await waitFor(() => expect(screen.getByRole('option', { name: 'About' })).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(router.state.location.pathname).toBe('/sites/site-1/content');
      expect(getSavedBody()).toEqual({
        schemaVersion: 6,
        name: 'Team (Copy)',
        title: 'Team (Copy)',
        type: 'page',
        layout: 'wide',
        // The source is live; a copy of it is not, unless asked for.
        published: false,
        sections: [{ id: 'sec-1', type: 'hero', settings: { heading: 'Hi' } }],
      });
    });
  });

  describe('page type', () => {
    const TYPED_TEMPLATE = {
      id: 'article',
      title: 'Article',
      content: { schemaVersion: 6, name: 'Article', title: 'Article', type: 'article', layout: 'theme', published: false, sections: [] },
    };

    // No Page type field here any more: a template and a type were two
    // adjacent choices that read as the same decision twice, so the
    // template is the single choice and carries the type with it. These
    // therefore assert the file that was written, not a visible field.
    it('is not asked for at creation - the template decides it', async () => {
      installFakeFetch({ templates: [TYPED_TEMPLATE] });
      renderModal();
      await waitForParentOptions();

      expect(screen.queryByLabelText('Page type')).toBeNull();
      expect(screen.getByLabelText('Template')).toBeDefined();
    });

    it('defaults to "page" when no template is chosen', async () => {
      const { getReceivedSaveBody } = installFakeFetch();
      const { router, onCreated } = renderModal();
      await waitForParentOptions();

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Plain' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(router.state.location.pathname).toBe('/sites/site-1/content');
      expect((getReceivedSaveBody() as { type: string }).type).toBe('page');
    });

    it("writes the chosen template's own type into the created page", async () => {
      const { getReceivedSaveBody } = installFakeFetch({ templates: [TYPED_TEMPLATE] });
      const { onCreated } = renderModal();
      await waitForParentOptions();

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Post' } });
      fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'article' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect((getReceivedSaveBody() as { type: string }).type).toBe('article');
    });

    it('switching back to Blank returns the type to "page"', async () => {
      const { getReceivedSaveBody } = installFakeFetch({ templates: [TYPED_TEMPLATE] });
      const { onCreated } = renderModal();
      await waitForParentOptions();

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed Mind' } });
      fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'article' } });
      fireEvent.change(screen.getByLabelText('Template'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect((getReceivedSaveBody() as { type: string }).type).toBe('page');
    });

    it("a duplicate keeps the source page's own type", async () => {
      const { getReceivedSaveBody } = installFakeFetch();
      const { onCreated } = renderModal(vi.fn(), { path: 'pages/projects/barwon.json', name: 'Barwon', type: 'project' });
      await waitForParentOptions();

      fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect((getReceivedSaveBody() as { type: string }).type).toBe('project');
    });
  });

  it('the header close icon calls onClose without saving', async () => {
    const { fetchMock } = installFakeFetch();
    const onClose = vi.fn();
    renderModal(onClose);
    await waitForParentOptions();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/drafts/'), expect.anything());
  });

  it('Cancel calls onClose without saving', async () => {
    const { fetchMock } = installFakeFetch();
    const onClose = vi.fn();
    renderModal(onClose);
    await waitForParentOptions();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/drafts/'), expect.anything());
  });
});

// The derived url used to be introduced by a sentence ("This page will
// be created at ..."); it is the bare path now, styled as a field note
// (requested directly). Nothing asserted it before, so dropping the
// sentence broke no test - which is exactly why it needs one.
describe('NewPageModal: the derived url line', () => {
  it('shows the derived url on its own, with no sentence in front of it', async () => {
    installFakeFetch();
    renderModal();
    await waitForParentOptions();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'About Us' } });

    const note = await screen.findByText('/about-us');
    expect(note).toBeDefined();
    expect(note.textContent).toBe('/about-us');
    expect(screen.queryByText(/will be created at/i)).toBeNull();
  });

  it('shows nothing at all until the title derives a path', async () => {
    installFakeFetch();
    renderModal();
    await waitForParentOptions();

    // Asserting the specific path is absent, not "nothing starting with
    // a slash" - a loose regex here would match unrelated text and pass
    // for the wrong reason.
    expect(screen.queryByText('/about-us')).toBeNull();
  });
});
