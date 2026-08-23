import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MediaLibraryPage } from '../../src/pages/MediaLibraryPage.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MediaLibraryPage', () => {
  it('fetches media scoped to the current siteId from the route and renders the library', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/sites/site-1/media');
      return new Response(
        JSON.stringify({ items: [{ name: 'photo.jpg', size: 5, mtimeMs: 1, url: 'http://x/media/photo.jpg' }], maxUploadBytes: 1000 }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/sites/site-1/media']}>
        <Routes>
          <Route path="/sites/:siteId/media" element={<MediaLibraryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeDefined());
    expect(screen.getByText('photo.jpg')).toBeDefined();
  });
});
