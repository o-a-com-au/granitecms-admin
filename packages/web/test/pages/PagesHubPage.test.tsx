import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { PagesHubPage } from '../../src/pages/PagesHubPage.tsx';
import { PageActionsProvider, PageDeviceToggleProvider } from '../../src/layout/PageActionsContext.tsx';
import { PreviewProvider, SharedPreviewRegion } from '../../src/layout/PreviewContext.tsx';
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

// Real SharedPreviewRegion under AppShell's own provider nesting
// (PreviewProvider outermost, wrapping PageActionsProvider/
// PageDeviceToggleProvider with real useState-backed setters) rather
// than a lighter probe/no-op stand-in - a no-op setDeviceToggle can't
// expose a real render loop (nothing ever re-renders from it), which is
// exactly how this file missed PagesHubPage's own unmemoized
// usePageDeviceToggle(<DeviceToggle .../>) call (fixed alongside
// PageEditorPage's identical bug - see PagesHubPage.tsx's own
// deviceToggleNode comment). This harness would hang/throw "Maximum
// update depth exceeded" if that regressed.
function Host({ children }: { children: ReactNode }) {
  const [, setActions] = useState<ReactNode>(null);
  const [, setDeviceToggle] = useState<ReactNode>(null);
  return (
    <PreviewProvider siteId="site-1">
      <PageActionsProvider setActions={setActions}>
        <PageDeviceToggleProvider setDeviceToggle={setDeviceToggle}>{children}</PageDeviceToggleProvider>
      </PageActionsProvider>
      <SharedPreviewRegion siteId="site-1" />
    </PreviewProvider>
  );
}

function renderHub() {
  // The data router (createMemoryRouter/RouterProvider), not the
  // declarative <MemoryRouter>/<Routes>/<Route> API - matches
  // main.tsx's own createBrowserRouter/RouterProvider exactly. Found to
  // matter directly: the declarative API's own re-render/bail-out
  // behaviour differed just enough that it failed to reproduce the
  // device-toggle render loop this harness exists to catch, even
  // against the genuinely broken source.
  //
  // A real /editor route (a plain stub, not PageEditorPage itself) so
  // useSectionClickToEdit's own navigate() call lands somewhere
  // observable via router.state.location - PagesHubPage itself doesn't
  // otherwise render anything of the Editor.
  const router = createMemoryRouter(
    [
      { path: '/sites/:siteId/content', element: <PagesHubPage /> },
      { path: '/sites/:siteId/editor', element: <div>editor stub</div> },
    ],
    { initialEntries: ['/sites/site-1/content'] },
  );
  return {
    router,
    ...render(
      <Host>
        <RouterProvider router={router} />
      </Host>,
    ),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PagesHubPage', () => {
  it('starts with the empty preview state when nothing was previously open in the Editor', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeContentApi();

    renderHub();

    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());
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

  it('clicking a page\'s own title also updates the shared Editor location, so switching Pages -> Editor opens that same page', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeContentApi();

    renderHub();
    await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'About' }));

    await waitFor(() => expect(screen.getByTitle('Live preview')).toBeDefined());
    expect(readLastEditorLocation('site-1')).toBe('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
  });

  describe('useSectionClickToEdit - hovering/clicking a section in the preview', () => {
    // Same jsdom-writes-directly-into-the-iframe-document technique
    // PageEditorPage.test.tsx's own writeIframeDocWithLink uses - jsdom
    // never actually navigates the iframe to fetch a real response, so
    // this stands in for what the real preview response would render.
    function writeSectionIntoIframe(iframe: HTMLIFrameElement, sectionId: string): HTMLElement {
      const doc = iframe.contentDocument as Document;
      doc.open();
      doc.write('<body></body>');
      doc.close();
      const section = doc.createElement('div');
      section.setAttribute('data-section-id', sectionId);
      section.textContent = 'Hero section';
      doc.body.append(section);
      fireEvent.load(iframe);
      return section;
    }

    async function previewAboutAndGetSection(sectionId: string) {
      vi.stubGlobal('localStorage', createFakeStorage());
      installFakeContentApi();
      const { router } = renderHub();
      await waitFor(() => expect(screen.getByRole('button', { name: 'About' })).toBeDefined());

      fireEvent.click(screen.getByRole('button', { name: 'About' }));
      const iframe = (await screen.findByTitle('Live preview')) as HTMLIFrameElement;
      const section = writeSectionIntoIframe(iframe, sectionId);
      return { router, section };
    }

    it('hovering a section in the preview outlines it', async () => {
      const { section } = await previewAboutAndGetSection('hero');

      fireEvent.mouseOver(section);
      expect(section.style.outline).not.toBe('');

      fireEvent.mouseOut(section);
      expect(section.style.outline).toBe('');
    });

    it('clicking a section in the preview navigates straight to the Editor for this page, with that section selected', async () => {
      const { router, section } = await previewAboutAndGetSection('hero');

      fireEvent.click(section);

      await waitFor(() => expect(router.state.location.pathname).toBe('/sites/site-1/editor'));
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('path')).toBe('pages/about.json');
      expect(params.get('url')).toBe('/about');
      expect(params.get('section')).toBe('hero');
    });
  });
});
