import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MediaPickerModal } from '../../src/media/MediaPickerModal.tsx';
import type { MediaItem } from '../../src/api/site-media.ts';

const ITEMS: MediaItem[] = [
  { name: 'alpha.jpg', size: 100, mtimeMs: 1, url: 'http://site.example/media/alpha.jpg' },
  { name: 'beta.png', size: 200, mtimeMs: 2, url: 'http://site.example/media/beta.png' },
];

function installFakeApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/sites/site-1/media') {
        return new Response(JSON.stringify({ items: ITEMS, maxUploadBytes: 1000 }), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MediaPickerModal', () => {
  it('Select is disabled until an item is highlighted', async () => {
    installFakeApi();
    render(<MediaPickerModal siteId="site-1" onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    const selectButton = screen.getByRole('button', { name: 'Select' });
    expect(selectButton).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByAltText('alpha.jpg'));

    expect(selectButton).toHaveProperty('disabled', false);
  });

  it('Select calls onSelect with the highlighted item', async () => {
    installFakeApi();
    const onSelect = vi.fn();
    render(<MediaPickerModal siteId="site-1" onSelect={onSelect} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    fireEvent.click(screen.getByAltText('beta.png'));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
  });

  it('Cancel calls onClose without calling onSelect', async () => {
    installFakeApi();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<MediaPickerModal siteId="site-1" onSelect={onSelect} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('alpha.jpg')).toBeDefined());

    fireEvent.click(screen.getByAltText('alpha.jpg'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
