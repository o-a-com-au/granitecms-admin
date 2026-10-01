import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecentlyDeleted } from '../../src/pages/RecentlyDeleted.tsx';

const DELETED = [
  { path: 'pages/old-offers.json', url: '/old-offers', title: 'Old Offers', deletedAt: '2026-10-01T00:00:00.000Z', deletedBy: 'Sam Editor', ref: 'abc123' },
];

function setup(pages: unknown, onRestored = vi.fn()) {
  const shown: Array<[string, string | null]> = [];
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (url.endsWith('/deleted-pages')) {
        return new Response(JSON.stringify({ pages }), { status: 200 });
      }
      return new Response('{"ok":true}', { status: 200 });
    }),
  );
  render(<RecentlyDeleted siteId="site-1" reloadToken={0} onRestored={onRestored} onShowVersion={(url, ref) => shown.push([url, ref])} />);
  return { calls, onRestored, shown };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RecentlyDeleted', () => {
  it('opens a popup from a link, previews a deleted page as it was (closing the popup), and restores it', async () => {
    const { calls, onRestored, shown } = setup(DELETED);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Recently deleted (1)' }));
    expect(screen.getByRole('dialog', { name: 'Recently deleted' })).toBeDefined();
    expect(screen.getByText(/deleted by Sam Editor/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Preview Old Offers' }));
    expect(shown.at(-1)).toEqual(['/old-offers', 'abc123']);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Recently deleted (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore Old Offers' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(calls.find((call) => call.url === '/api/sites/site-1/revert')?.body).toEqual({
      ref: 'abc123',
      path: 'pages/old-offers.json',
      message: 'Restore Old Offers',
    });
    expect(shown.at(-1)).toEqual(['/old-offers', null]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with Escape or Close', async () => {
    setup(DELETED);
    fireEvent.click(await screen.findByRole('button', { name: 'Recently deleted (1)' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Recently deleted (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is not there at all when nothing has been deleted, or the website cannot say', async () => {
    setup([]);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Recently deleted/ })).toBeNull());
  });
});
