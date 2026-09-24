import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewMenuModal } from '../../src/pages/NewMenuModal.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderModal(onCreated = vi.fn(), onClose = vi.fn(), supportsMenuEditing = false) {
  return {
    onCreated,
    onClose,
    ...render(<NewMenuModal siteId="site-1" supportsMenuEditing={supportsMenuEditing} onCreated={onCreated} onClose={onClose} />),
  };
}

function installFakeFetch({ saveStatus = 200 }: { saveStatus?: number } = {}) {
  let receivedSaveBody: unknown;
  let receivedSaveUrl: string | undefined;
  let receivedIfMatch: string | undefined;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/menus/') && init?.method === 'PUT') {
      receivedSaveUrl = url;
      receivedIfMatch = (init.headers as Record<string, string>)['If-Match'];
      receivedSaveBody = JSON.parse(init.body as string);
      if (saveStatus !== 200) {
        return new Response(JSON.stringify({ message: 'conflict' }), { status: saveStatus });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"abc"' } });
    }
    throw new Error(`unhandled fetch in test: ${url} ${init?.method as string}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    getReceivedSaveBody: () => receivedSaveBody,
    getReceivedSaveUrl: () => receivedSaveUrl,
    getReceivedIfMatch: () => receivedIfMatch,
  };
}

describe('NewMenuModal', () => {
  it('the Handle field follows Name until typed into directly, and never shows a file path', async () => {
    installFakeFetch();
    renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Footer Company' } });
    await waitFor(() => expect((screen.getByLabelText('Handle') as HTMLInputElement).value).toBe('footer-company'));

    fireEvent.change(screen.getByLabelText('Handle'), { target: { value: 'custom' } });
    expect((screen.getByLabelText('Handle') as HTMLInputElement).value).toBe('custom');
    expect(screen.queryByLabelText('Path')).toBeNull();
  });

  it('creates a live menu through the menus endpoint, never as a draft, then calls onCreated and onClose', async () => {
    const { getReceivedSaveBody, getReceivedSaveUrl, getReceivedIfMatch } = installFakeFetch();
    const { onCreated, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Footer Company' } });
    await waitFor(() => expect((screen.getByLabelText('Handle') as HTMLInputElement).value).toBe('footer-company'));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    // An agent older than content schema 7 rejects "name", so without
    // support Name only ever suggests the path.
    expect(getReceivedSaveBody()).toEqual({
      content: { schemaVersion: 7, items: [] },
      message: 'Create menu Footer Company',
    });
    // The agent never reads menus from drafts, so a draft-created menu
    // never reached the site.
    expect(getReceivedSaveUrl()).toBe('/api/sites/site-1/menus/menus/footer-company.json');
    expect(getReceivedIfMatch()).toBe('*');
  });

  it('saves the typed Name as the menu\'s own display name when the site supports it', async () => {
    const { getReceivedSaveBody } = installFakeFetch();
    const { onCreated } = renderModal(vi.fn(), vi.fn(), true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Footer Company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(getReceivedSaveBody()).toEqual({
      content: { schemaVersion: 7, name: 'Footer Company', items: [] },
      message: 'Create menu Footer Company',
    });
  });

  it('shows a real conflict message and does not call onCreated/onClose when the path already exists', async () => {
    installFakeFetch({ saveStatus: 409 });
    const { onCreated, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Footer Company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('A menu with that handle already exists')).toBeDefined());
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Cancel calls onClose without saving', () => {
    const onClose = vi.fn();
    installFakeFetch();
    renderModal(vi.fn(), onClose);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
