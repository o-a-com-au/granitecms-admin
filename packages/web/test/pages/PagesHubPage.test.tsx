import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PagesHubPage } from '../../src/pages/PagesHubPage.tsx';
import { PageActionsProvider, PageDeviceToggleProvider } from '../../src/layout/PageActionsContext.tsx';
import { PreviewProvider, usePreview } from '../../src/layout/PreviewContext.tsx';
import { PreviewFrame } from '../../src/editor/PreviewFrame.tsx';
import { readLastEditorLocation } from '../../src/sites/currentSite.ts';
import { createFakeStorage } from '../helpers/fakeStorage.ts';

const ENTRY = {
  path: 'pages/about.json',
  name: 'About',
  title: 'About',
  type: 'page',
  published: true,
  hasDraft: false,
  url: '/about',
  changedAt: null,
};

function installFakeContentApi() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY]), { status: 200 })));
}

// Stands in for AppShell's own SharedPreviewRegion - the real shared
// viewport is AppShell's job, not PagesHubPage's, so this is the
// minimum needed here to observe what PagesHubPage pushes into the
// shared context (previewUrl/device) without pulling in the whole
// shell.
function PreviewRegionProbe({ siteId }: { siteId: string }) {
  const { visible, previewUrl, device } = usePreview();
  if (!visible) {
    return null;
  }
  return <PreviewFrame siteId={siteId} url={previewUrl} status="ready" device={device} />;
}

// PagesHubPage calls usePageDeviceToggle, which no-ops without a
// provider above it - the real one lives in AppShell.tsx, out of scope
// for this test.
function renderHub() {
  return render(
    <PageActionsProvider setActions={() => {}}>
      <PageDeviceToggleProvider setDeviceToggle={() => {}}>
        <MemoryRouter initialEntries={['/sites/site-1/content']}>
          <Routes>
            <Route
              path="/sites/:siteId/content"
              element={
                <PreviewProvider siteId="site-1">
                  <PagesHubPage />
                  <PreviewRegionProbe siteId="site-1" />
                </PreviewProvider>
              }
            />
          </Routes>
        </MemoryRouter>
      </PageDeviceToggleProvider>
    </PageActionsProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PagesHubPage', () => {
  it('starts with the empty preview state when nothing was previously open in the Editor', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeContentApi();

    renderHub();

    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());
    expect(screen.getByText('No live preview available for this content type.')).toBeDefined();
  });

  it('seeds the preview from the page last open in the Editor, so switching Editor -> Pages shows the same page', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    localStorage.setItem(
      'cms-admin-last-editor-location',
      JSON.stringify({ 'site-1': '/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout' }),
    );
    installFakeContentApi();

    renderHub();

    await waitFor(() => expect(screen.getByTitle('Live preview')).toBeDefined());
    expect(screen.getByTitle('Live preview').getAttribute('src')).toContain('/api/sites/site-1/preview/about');
  });

  it('clicking a page\'s Preview button also updates the shared Editor location, so switching Pages -> Editor opens that same page', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeContentApi();

    renderHub();
    await waitFor(() => expect(screen.getByRole('link', { name: 'About' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Preview About' }));

    await waitFor(() => expect(screen.getByTitle('Live preview')).toBeDefined());
    expect(readLastEditorLocation('site-1')).toBe('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
  });
});
