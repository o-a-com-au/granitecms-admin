import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MediaLibraryPage } from '../../src/pages/MediaLibraryPage.tsx';
import { PreviewProvider, SharedPreviewRegion } from '../../src/layout/PreviewContext.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

// PreviewProvider/SharedPreviewRegion stand in for AppShell itself -
// MediaLibraryPage still asks for the shared viewport to stay visible
// (usePreviewVisible, PreviewContext.tsx), so a bare render() with no
// provider would throw. SharedPreviewRegion here is the exact same
// component AppShell.tsx renders in the real app - kept in this harness
// to prove opening the image popup below doesn't disturb it.
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

  it('clicking a media item opens it in a popup, leaving the shared viewport (no live page here) alone', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('photo.jpg')).toBeDefined());

    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByAltText('photo.jpg'));

    const dialog = await screen.findByRole('dialog');
    const preview = dialog.querySelector('.media-image-preview-modal-body img') as HTMLImageElement;
    expect(preview.src).toBe('http://x/media/photo.jpg');
    expect(screen.queryByTitle('Live preview')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
