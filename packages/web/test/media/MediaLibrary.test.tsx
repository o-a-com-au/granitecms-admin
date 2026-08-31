import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MediaLibrary } from '../../src/media/MediaLibrary.tsx';
import type { MediaItem } from '../../src/api/site-media.ts';

const ITEMS: MediaItem[] = [
  { name: 'alpha.jpg', size: 100, mtimeMs: 1, url: 'http://site.example/media/alpha.jpg' },
  { name: 'beta.png', size: 200, mtimeMs: 2, url: 'http://site.example/media/beta.png' },
];

function installFakeApi(initialItems: MediaItem[] = ITEMS) {
  let items = [...initialItems];
  const calls: Array<{ method: string; url: string }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? 'GET';
    calls.push({ method, url });

    if (method === 'GET' && url === '/api/sites/site-1/media') {
      return new Response(JSON.stringify({ items, maxUploadBytes: 1000 }), { status: 200 });
    }
    if (method === 'POST' && url === '/api/sites/site-1/media') {
      const form = init?.body as FormData;
      const file = form.get('file') as File;
      const newItem: MediaItem = { name: file.name, size: file.size, mtimeMs: Date.now(), url: `http://site.example/media/${file.name}` };
      items = [...items, newItem];
      return new Response(JSON.stringify({ name: newItem.name, size: newItem.size, url: newItem.url }), { status: 201 });
    }
    if (method === 'DELETE' && url.startsWith('/api/sites/site-1/media/')) {
      const name = decodeURIComponent(url.replace('/api/sites/site-1/media/', ''));
      items = items.filter((item) => item.name !== name);
      return new Response(null, { status: 204 });
    }

    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MediaLibrary', () => {
  it('lists media items returned from the site', async () => {
    installFakeApi();
    render(<MediaLibrary siteId="site-1" mode="panel" />);

    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());
    expect(screen.getByText('beta.png')).toBeDefined();
  });

  it('filters the grid by the search box, client-side', async () => {
    installFakeApi();
    render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    fireEvent.change(screen.getByPlaceholderText('Search media'), { target: { value: 'beta' } });

    expect(screen.queryByText('alpha.jpg')).toBeNull();
    expect(screen.getByText('beta.png')).toBeDefined();
  });

  it('uploading a valid file POSTs it and refreshes the list', async () => {
    const { calls } = installFakeApi();
    render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    const file = new File(['hello'], 'gamma.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('gamma.jpg')).toBeDefined());
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(2);
  });

  it('rejects an unsupported file type client-side, without ever calling the API', async () => {
    const { calls } = installFakeApi();
    render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/notes.txt/)).toBeDefined());
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('rejects an oversized file client-side, without ever calling the API', async () => {
    const { calls } = installFakeApi();
    render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    const big = new File([new Uint8Array(2000)], 'huge.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [big] } });

    await waitFor(() => expect(screen.getByText(/huge.jpg/)).toBeDefined());
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });

  it('drag-enter onto a child element then leaving it does not flicker the highlight off', async () => {
    installFakeApi();
    const { container } = render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    const dropzone = container.querySelector('.media-library-dropzone') as HTMLElement;
    const child = screen.getByText('alpha.jpg');

    fireEvent.dragEnter(dropzone);
    expect(dropzone.className).toContain('is-drag-active');

    fireEvent.dragEnter(child);
    fireEvent.dragLeave(child);
    expect(dropzone.className).toContain('is-drag-active');

    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).not.toContain('is-drag-active');
  });

  it('deleting a card calls delete with the right name and refreshes the list', async () => {
    const { calls } = installFakeApi();
    render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete alpha.jpg' }));

    await waitFor(() => expect(screen.queryByText('alpha.jpg')).toBeNull());
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/sites/site-1/media/alpha.jpg' });
  });

  it('picker mode: clicking a thumbnail reports it via onSelectedItemChange, without any other select action', async () => {
    installFakeApi();
    const onSelectedItemChange = vi.fn();
    render(<MediaLibrary siteId="site-1" mode="picker" selectedItem={null} onSelectedItemChange={onSelectedItemChange} />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    fireEvent.click(screen.getByAltText('alpha.jpg'));

    expect(onSelectedItemChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemChange).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('picker mode: a second click on a different item changes the selection rather than adding to it', async () => {
    installFakeApi();
    const onSelectedItemChange = vi.fn();
    const { rerender } = render(
      <MediaLibrary siteId="site-1" mode="picker" selectedItem={null} onSelectedItemChange={onSelectedItemChange} />,
    );
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    fireEvent.click(screen.getByAltText('alpha.jpg'));
    rerender(
      <MediaLibrary siteId="site-1" mode="picker" selectedItem={ITEMS[0]} onSelectedItemChange={onSelectedItemChange} />,
    );
    fireEvent.click(screen.getByAltText('beta.png'));

    expect(onSelectedItemChange).toHaveBeenLastCalledWith(ITEMS[1]);
    expect(onSelectedItemChange).toHaveBeenCalledTimes(2);
  });

  it('panel mode with no selection prop supplied: clicking a thumbnail does nothing (defensive only - MediaLibraryPage always supplies one)', async () => {
    installFakeApi();
    render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    // No onSelectedItemChange passed - clicking must not throw.
    expect(() => fireEvent.click(screen.getByAltText('alpha.jpg'))).not.toThrow();
  });

  it('panel mode: clicking a thumbnail reports it via onSelectedItemChange, for the shared viewport to preview it large', async () => {
    installFakeApi();
    const onSelectedItemChange = vi.fn();
    render(<MediaLibrary siteId="site-1" mode="panel" selectedItem={null} onSelectedItemChange={onSelectedItemChange} />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    fireEvent.click(screen.getByAltText('alpha.jpg'));

    expect(onSelectedItemChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemChange).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('panel mode: the currently previewed item is highlighted, same as picker mode', async () => {
    installFakeApi();
    const { rerender } = render(
      <MediaLibrary siteId="site-1" mode="panel" selectedItem={ITEMS[0]} onSelectedItemChange={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    expect(screen.getByAltText('alpha.jpg').closest('.media-library-item')?.className).toContain('is-selected');
    expect(screen.getByAltText('beta.png').closest('.media-library-item')?.className).not.toContain('is-selected');

    rerender(<MediaLibrary siteId="site-1" mode="panel" selectedItem={null} onSelectedItemChange={vi.fn()} />);
    expect(screen.getByAltText('alpha.jpg').closest('.media-library-item')?.className).not.toContain('is-selected');
  });
});
