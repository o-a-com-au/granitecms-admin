import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { NewPageModal } from '../../src/pages/NewPageModal.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderModal(onClose = vi.fn()) {
  const router = createMemoryRouter(
    [
      { path: '/sites/:siteId/content', element: <NewPageModal siteId="site-1" onClose={onClose} /> },
      { path: '/sites/:siteId/editor', element: <div>editor placeholder</div> },
    ],
    { initialEntries: ['/sites/site-1/content'] },
  );
  return { router, onClose, ...render(<RouterProvider router={router} />) };
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

function pageEntry(path: string, name: string) {
  return { path, name, title: name, type: 'page', published: true, hasDraft: false, url: null, changedAt: null };
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
    expect(screen.queryByRole('button', { name: 'Blank page' })).toBeNull();
  });

  it('hides the Template dropdown when the theme declares no templates', async () => {
    installFakeFetch({ templates: [] });
    renderModal();
    await waitForParentOptions();

    expect(screen.queryByLabelText('Template')).toBeNull();
  });

  it('shows the Template dropdown, defaulting to Blank page, once a template exists', async () => {
    installFakeFetch({ templates: [TEMPLATE] });
    renderModal();
    await waitForParentOptions();

    const select = screen.getByLabelText('Template') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: 'Blank page' })).toBeDefined();
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

  it('derives the slug from the title and creates a top-level page', async () => {
    const { getReceivedSaveBody, getReceivedSavePath } = installFakeFetch();
    const { router } = renderModal();
    await waitForParentOptions();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My New Page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sites/site-1/editor'));
    // saveSiteDraft encodes each path segment separately and rejoins
    // with '/', so the slashes survive in the request URL - only the
    // navigate() query params below are whole-value encoded.
    expect(getReceivedSavePath()).toContain('/drafts/pages/my-new-page.json');
    expect(router.state.location.search).toBe('?path=pages%2Fmy-new-page.json&url=%2Fmy-new-page');
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
    const { router } = renderModal();
    await waitForParentOptions();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Our Team' } });
    fireEvent.change(screen.getByLabelText('Parent'), { target: { value: 'pages/about.json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sites/site-1/editor'));
    expect(getReceivedSavePath()).toContain('/drafts/pages/about/our-team.json');
    expect(router.state.location.search).toBe('?path=pages%2Fabout%2Four-team.json&url=%2Fabout%2Four-team');
  });

  it('creates from a chosen template - sections/layout kept, name/title/schemaVersion/published overridden', async () => {
    const { getReceivedSaveBody } = installFakeFetch({ templates: [TEMPLATE] });
    const { router } = renderModal();
    await waitForParentOptions();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Post' } });
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'blog-article' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sites/site-1/editor'));
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
