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

function installFakeFetch({ templates = [] as unknown[], saveStatus = 200 }: { templates?: unknown[]; saveStatus?: number } = {}) {
  let receivedSaveBody: unknown;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/theme/page-templates')) {
      return new Response(JSON.stringify({ templates }), { status: 200 });
    }
    if (url.includes('/drafts/')) {
      receivedSaveBody = JSON.parse(init?.body as string);
      if (saveStatus !== 200) {
        return new Response(JSON.stringify({ message: 'A page already exists at that path' }), { status: saveStatus });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"abc"' } });
    }
    throw new Error(`unhandled fetch in test: ${url} ${init?.method as string}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, getReceivedSaveBody: () => receivedSaveBody };
}

async function chooseTemplate(name: string): Promise<void> {
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name }));
  await waitFor(() => expect(screen.getByLabelText('Title')).toBeDefined());
}

describe('NewPageModal', () => {
  it('opens on a grid of template cards, "Blank page" first, even when the theme has no real templates', async () => {
    const { fetchMock } = installFakeFetch({ templates: [] });
    renderModal();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const cards = await screen.findAllByRole('button', { name: /^(Blank page|Blog Article)$/ });
    expect(cards.map((card) => card.textContent)).toEqual(['Blank page']);
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('a real template appears as its own card alongside Blank page', async () => {
    installFakeFetch({ templates: [TEMPLATE] });
    renderModal();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Blog Article' })).toBeDefined());
    expect(screen.getByRole('button', { name: 'Blank page' })).toBeDefined();
  });

  it('choosing a card advances to the Title/Path form, and Back returns to the grid', async () => {
    installFakeFetch({ templates: [] });
    renderModal();

    await chooseTemplate('Blank page');
    expect(screen.queryByRole('button', { name: 'Blank page' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '‹ Back' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Blank page' })).toBeDefined());
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('creates a blank page (schemaVersion 5, published false) and navigates to the editor for it', async () => {
    const { getReceivedSaveBody } = installFakeFetch({ templates: [] });
    const { router } = renderModal();

    await chooseTemplate('Blank page');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Page' } });
    await waitFor(() => expect((screen.getByLabelText('Path') as HTMLInputElement).value).toBe('pages/my-page.json'));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sites/site-1/editor'));
    expect(router.state.location.search).toBe('?path=pages%2Fmy-page.json&url=%2Fmy-page');
    expect(getReceivedSaveBody()).toEqual({
      schemaVersion: 5,
      name: 'My Page',
      title: 'My Page',
      type: 'page',
      layout: 'theme',
      published: false,
      sections: [],
    });
  });

  it('the Path field can be edited directly, overriding the title-derived suggestion', async () => {
    installFakeFetch({ templates: [] });
    renderModal();

    await chooseTemplate('Blank page');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Page' } });
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: 'pages/custom-path.json' } });

    expect((screen.getByLabelText('Path') as HTMLInputElement).value).toBe('pages/custom-path.json');
  });

  it('creates a page from a chosen template - sections/layout kept, name/title/schemaVersion/published overridden', async () => {
    const { getReceivedSaveBody } = installFakeFetch({ templates: [TEMPLATE] });
    const { router } = renderModal();

    await chooseTemplate('Blog Article');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Post' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sites/site-1/editor'));
    expect(getReceivedSaveBody()).toEqual({
      schemaVersion: 5,
      name: 'My Post',
      title: 'My Post',
      type: 'page',
      layout: 'blog',
      published: false,
      sections: [{ id: 'sec-1', type: 'hero', settings: { heading: 'Hi' } }],
    });
  });

  it('shows a real conflict message and does not navigate when the path already exists', async () => {
    installFakeFetch({ templates: [], saveStatus: 409 });
    const { router } = renderModal();

    await chooseTemplate('Blank page');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('A page already exists at that path')).toBeDefined());
    expect(router.state.location.pathname).toBe('/sites/site-1/content');
  });

  it('the close button on the template grid calls onClose without saving', async () => {
    const { fetchMock } = installFakeFetch({ templates: [] });
    const onClose = vi.fn();
    renderModal(onClose);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/drafts/'), expect.anything());
  });

  it('Cancel on the details form calls onClose without saving', async () => {
    const { fetchMock } = installFakeFetch({ templates: [] });
    const onClose = vi.fn();
    renderModal(onClose);

    await chooseTemplate('Blank page');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/drafts/'), expect.anything());
  });
});
