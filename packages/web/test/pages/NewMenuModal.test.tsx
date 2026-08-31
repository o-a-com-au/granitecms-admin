import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { NewMenuModal } from '../../src/pages/NewMenuModal.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderModal(onClose = vi.fn()) {
  const router = createMemoryRouter(
    [
      { path: '/sites/:siteId/content', element: <NewMenuModal siteId="site-1" onClose={onClose} /> },
      { path: '/sites/:siteId/menus/edit', element: <div>menu editor placeholder</div> },
    ],
    { initialEntries: ['/sites/site-1/content'] },
  );
  return { router, onClose, ...render(<RouterProvider router={router} />) };
}

function installFakeFetch({ saveStatus = 200 }: { saveStatus?: number } = {}) {
  let receivedSaveBody: unknown;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/drafts/')) {
      receivedSaveBody = JSON.parse(init?.body as string);
      if (saveStatus !== 200) {
        return new Response(JSON.stringify({ message: 'A menu already exists at that path' }), { status: saveStatus });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"abc"' } });
    }
    throw new Error(`unhandled fetch in test: ${url} ${init?.method as string}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, getReceivedSaveBody: () => receivedSaveBody };
}

describe('NewMenuModal', () => {
  it('the Path field follows Name until typed into directly', async () => {
    installFakeFetch();
    renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Footer Company' } });
    await waitFor(() => expect((screen.getByLabelText('Path') as HTMLInputElement).value).toBe('menus/footer-company.json'));

    fireEvent.change(screen.getByLabelText('Path'), { target: { value: 'menus/custom.json' } });
    expect((screen.getByLabelText('Path') as HTMLInputElement).value).toBe('menus/custom.json');
  });

  it('creates a menu (schemaVersion 1, empty items) and navigates to its editor', async () => {
    const { getReceivedSaveBody } = installFakeFetch();
    const { router } = renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Footer Company' } });
    await waitFor(() => expect((screen.getByLabelText('Path') as HTMLInputElement).value).toBe('menus/footer-company.json'));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sites/site-1/menus/edit'));
    expect(router.state.location.search).toBe('?path=menus%2Ffooter-company.json');
    expect(getReceivedSaveBody()).toEqual({ schemaVersion: 1, items: [] });
  });

  it('shows a real conflict message and does not navigate when the path already exists', async () => {
    installFakeFetch({ saveStatus: 409 });
    const { router } = renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Footer Company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('A menu already exists at that path')).toBeDefined());
    expect(router.state.location.pathname).toBe('/sites/site-1/content');
  });

  it('Cancel calls onClose without saving', () => {
    const onClose = vi.fn();
    installFakeFetch();
    renderModal(onClose);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
