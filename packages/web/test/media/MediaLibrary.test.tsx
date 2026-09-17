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

// Named rather than pulled back out of MIXED by index: this tsconfig
// runs with noUncheckedIndexedAccess, so MIXED[0] is typed
// MediaItem | undefined and cannot be handed straight to a MediaItem[].
const IMAGE_ITEM: MediaItem = { name: 'alpha.jpg', size: 100, mtimeMs: 1, url: 'http://site.example/media/alpha.jpg' };
const VIDEO_ITEM: MediaItem = { name: 'loop.mp4', size: 200, mtimeMs: 2, url: 'http://site.example/media/loop.mp4' };
const MIXED: MediaItem[] = [IMAGE_ITEM, VIDEO_ITEM];

describe('MediaLibrary video support', () => {
  it('shows a video as the placeholder thumbnail, not a broken <img> of the clip itself', async () => {
    installFakeApi(MIXED);
    const view = render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('loop.mp4')).toBeDefined());

    const images = Array.from(view.container.querySelectorAll('img')) as HTMLImageElement[];
    const sources = images.map((image) => image.getAttribute('src'));
    // The video tile points at the static placeholder; the image tile
    // still points at its own file. A positive control on both sides,
    // since asserting only the placeholder's presence would pass even
    // if every tile had wrongly become a placeholder.
    expect(sources).toContain('/video-placeholder.jpg');
    expect(sources).toContain('http://site.example/media/alpha.jpg');
  });

  it('labels a video with its real duration once metadata arrives, floored to mm:ss', async () => {
    installFakeApi(MIXED);
    const { container } = render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('loop.mp4')).toBeDefined());

    // No duration is claimed before the browser has actually read any.
    expect(container.querySelector('.media-library-item-duration')).toBeNull();

    const probe = container.querySelector('.media-library-item-probe') as HTMLVideoElement;
    expect(probe).not.toBeNull();
    // jsdom never decodes anything, so duration is supplied here the
    // way a real metadata load would supply it.
    Object.defineProperty(probe, 'duration', { value: 15.8, configurable: true });
    fireEvent.loadedMetadata(probe);

    expect(screen.getByText('0:15')).toBeDefined();
  });

  it('renders no duration at all when the browser cannot determine one', async () => {
    installFakeApi(MIXED);
    const { container } = render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('loop.mp4')).toBeDefined());

    const probe = container.querySelector('.media-library-item-probe') as HTMLVideoElement;
    Object.defineProperty(probe, 'duration', { value: NaN, configurable: true });
    fireEvent.loadedMetadata(probe);

    // Never "NaN:NaN" - the label is simply absent.
    expect(container.querySelector('.media-library-item-duration')).toBeNull();
  });

  it('gives an image tile no video furniture', async () => {
    installFakeApi([IMAGE_ITEM]);
    const { container } = render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    expect(container.querySelector('.media-library-item-probe')).toBeNull();
    expect(container.querySelector('.media-library-item-kind')).toBeNull();
  });

  it('filters the grid to one kind, and back to all', async () => {
    installFakeApi(MIXED);
    render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'videos' }));
    expect(screen.queryByText('alpha.jpg')).toBeNull();
    expect(screen.getByText('loop.mp4')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'images' }));
    expect(screen.getByText('alpha.jpg')).toBeDefined();
    expect(screen.queryByText('loop.mp4')).toBeNull();

    // Back to 'all' - proving the filter is not a one-way trip. This is
    // the assertion that would fail if 'kind' were missing from the
    // toolbar's useMemo deps and the control captured a stale closure.
    fireEvent.click(screen.getByRole('button', { name: 'all' }));
    expect(screen.getByText('alpha.jpg')).toBeDefined();
    expect(screen.getByText('loop.mp4')).toBeDefined();
  });

  it('marks the active filter with aria-pressed, which is the state itself here', async () => {
    installFakeApi(MIXED);
    render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    expect(screen.getByRole('button', { name: 'all' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'videos' }));
    expect(screen.getByRole('button', { name: 'videos' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'all' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('says which kind came up empty rather than blaming the search box', async () => {
    installFakeApi([IMAGE_ITEM]);
    render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'videos' }));
    expect(screen.getByText('No videos match your search.')).toBeDefined();
  });

  it('offers video types to the file picker', async () => {
    installFakeApi(MIXED);
    const { container } = render(<MediaLibrary siteId="site-1" mode="panel" />);
    await waitFor(() => expect(screen.getByText('loop.mp4')).toBeDefined());

    const accept = container.querySelector('input[type="file"]')?.getAttribute('accept') ?? '';
    expect(accept).toContain('video/mp4');
    expect(accept).toContain('video/webm');
    expect(accept).toContain('image/jpeg');
  });
});
