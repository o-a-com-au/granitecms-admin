import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AddressBarSearchModal } from '../../src/layout/AddressBarSearchModal.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ENTRIES = [
  {
    path: 'pages/about.json',
    name: 'About Us',
    title: 'About Us | Example',
    type: 'page',
    published: true,
    hasDraft: false,
    url: '/about',
    changedAt: null,
  },
  {
    path: 'pages/blog/what-about-commercial.json',
    name: 'What about the commercial freedom of business',
    title: 'Commercial freedom',
    type: 'article',
    published: true,
    hasDraft: false,
    url: '/blog/what-about-commercial',
    changedAt: null,
  },
  {
    path: 'pages/pricing.json',
    name: 'Pricing',
    title: 'Pricing plans',
    type: 'page',
    published: true,
    hasDraft: false,
    url: '/pricing',
    changedAt: null,
  },
];

function installFakeFetch(entries: unknown[] = ENTRIES) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/sites/site-1/content') {
      return new Response(JSON.stringify(entries), { status: 200 });
    }
    throw new Error(`unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderModal(onClose = vi.fn()) {
  const router = createMemoryRouter(
    [
      {
        path: '/sites/:siteId/content',
        element: <AddressBarSearchModal siteId="site-1" domainLabel="examplewebsite.com.au" onClose={onClose} />,
      },
      { path: '/sites/:siteId/editor', element: <div>editor placeholder</div> },
    ],
    { initialEntries: ['/sites/site-1/content'] },
  );
  return { router, onClose, ...render(<RouterProvider router={router} />) };
}

describe('AddressBarSearchModal', () => {
  it('shows an empty state naming the domain until something is typed', () => {
    installFakeFetch();
    renderModal();

    expect(screen.getByText('Search for pages in examplewebsite.com.au')).toBeDefined();
  });

  it('filters results by name or title as the user types', async () => {
    installFakeFetch();
    renderModal();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search pages' }), { target: { value: 'about' } });

    await waitFor(() => expect(screen.getByText('About Us')).toBeDefined());
    expect(screen.getByText('What about the commercial freedom of business')).toBeDefined();
    expect(screen.queryByText('Pricing')).toBeNull();
  });

  it('matches against title as well as name', async () => {
    installFakeFetch();
    renderModal();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search pages' }), { target: { value: 'plans' } });

    await waitFor(() => expect(screen.getByText('Pricing')).toBeDefined());
    expect(screen.queryByText('About Us')).toBeNull();
  });

  it('shows a type label only when the page\'s own type is not the default "page"', async () => {
    installFakeFetch();
    renderModal();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search pages' }), { target: { value: 'about' } });

    await waitFor(() => expect(screen.getByText('Article')).toBeDefined());
    // "About Us" itself is a plain page - no label rendered for its own row.
    expect(screen.queryAllByText('Page')).toHaveLength(0);
  });

  it('shows a no-results message when nothing matches', async () => {
    installFakeFetch();
    renderModal();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search pages' }), { target: { value: 'nonexistent' } });

    await waitFor(() => expect(screen.getByText('No pages match "nonexistent"')).toBeDefined());
  });

  it('selecting a result navigates to that page in the editor and closes', async () => {
    installFakeFetch();
    const onClose = vi.fn();
    const { router } = renderModal(onClose);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search pages' }), { target: { value: 'about us' } });
    await waitFor(() => expect(screen.getByText('About Us')).toBeDefined());

    fireEvent.click(screen.getByText('About Us'));

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(router.state.location.pathname).toBe('/sites/site-1/editor'));
    expect(router.state.location.search).toBe('?path=pages%2Fabout.json&url=%2Fabout');
  });

  it('Escape closes the modal', () => {
    installFakeFetch();
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the backdrop closes, but clicking inside the box does not', () => {
    installFakeFetch();
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
