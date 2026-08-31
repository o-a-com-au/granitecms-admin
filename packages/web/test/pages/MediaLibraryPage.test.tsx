import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MediaLibraryPage } from '../../src/pages/MediaLibraryPage.tsx';
import { PreviewProvider, SharedPreviewRegion } from '../../src/layout/PreviewContext.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

// PreviewProvider/SharedPreviewRegion stand in for AppShell itself -
// MediaLibraryPage drives the live preview via the shared PreviewContext
// rather than rendering any of it itself (usePreviewVisible/
// usePreviewBody, PreviewContext.tsx), so a bare render() with no
// provider would throw. SharedPreviewRegion here is the exact same
// component AppShell.tsx renders in the real app.
function renderPage() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    expect(input.toString()).toBe('/api/sites/site-1/media');
    return new Response(
      JSON.stringify({
        items: [{ name: 'photo.jpg', size: 5, mtimeMs: 1, url: 'http://x/media/photo.jpg' }],
        maxUploadBytes: 1000,
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  return render(
    <MemoryRouter initialEntries={['/sites/site-1/media']}>
      <PreviewProvider siteId="site-1">
        <Routes>
          <Route path="/sites/:siteId/media" element={<MediaLibraryPage />} />
        </Routes>
        <SharedPreviewRegion siteId="site-1" />
      </PreviewProvider>
    </MemoryRouter>,
  );
}

describe('MediaLibraryPage', () => {
  it('fetches media scoped to the current siteId from the route and renders the library', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Media' })).toBeDefined());
    expect(screen.getByText('photo.jpg')).toBeDefined();
  });

  it('clicking a media item previews it large in the shared viewport instead of the site iframe', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('photo.jpg')).toBeDefined());

    expect(document.querySelector('.media-preview-body')).toBeNull();

    fireEvent.click(screen.getByAltText('photo.jpg'));

    await waitFor(() => expect(document.querySelector('.media-preview-body')).not.toBeNull());
    const preview = document.querySelector('.media-preview-body img') as HTMLImageElement;
    expect(preview.src).toBe('http://x/media/photo.jpg');
    expect(screen.queryByTitle('Live preview')).toBeNull();
  });
});
