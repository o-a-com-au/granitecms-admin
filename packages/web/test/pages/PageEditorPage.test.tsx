import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { PageEditorPage } from '../../src/pages/PageEditorPage.tsx';
import { PageActionsProvider, PageDeviceToggleProvider } from '../../src/layout/PageActionsContext.tsx';

// Stands in for AppShell's own top-bar slots - PageEditorPage pushes
// Discard/Save Changes and the device-size toggle into them via
// usePageActions/usePageDeviceToggle rather than rendering either
// itself, so a bare render() with no providers would silently drop
// both (each hook no-ops without its own provider).
function TestPageActionsHost({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  const [deviceToggle, setDeviceToggle] = useState<ReactNode>(null);
  return (
    <PageActionsProvider setActions={setActions}>
      <PageDeviceToggleProvider setDeviceToggle={setDeviceToggle}>
        <div className="app-topbar-device-toggle">{deviceToggle}</div>
        <div className="app-topbar-actions">{actions}</div>
        {children}
      </PageDeviceToggleProvider>
    </PageActionsProvider>
  );
}

interface FakeState {
  content: string | null;
  etag: string | null;
  source: 'draft' | 'live';
  // G3: what a discard should reveal underneath the draft - only set
  // by tests that care about proving the reverted content, distinct
  // from whatever was being edited. Left unset, discard just flips
  // source to 'live' without changing content (still a valid draft-
  // cleared assertion, just not a content-reverted one).
  liveContent?: string;
  liveEtag?: string;
  // G5: forces publish itself to fail with a real 502, independent of
  // content nullity - the initial load still succeeds.
  forceActionFailure?: boolean;
  // Forces the draft-save PUT itself to fail with a 400, independent
  // of the ETag check - for asserting on the resulting 'save-error'
  // state (and that Save Changes becomes unclickable while in it).
  forceDraftSaveError?: boolean;
  // Backs the site's content listing (GET /content, no trailing path -
  // distinct from the single-item GET /content/:path read below) that
  // PageEditorPage indexes url -> path from, for the preview-click-to-
  // navigate feature. Left empty by default - most tests never click a
  // link inside the preview, so there is nothing to resolve.
  contentList?: Array<{ path: string; url: string | null }>;
  // Backs the History tab's own commit list - left empty by default,
  // same reasoning as contentList above (most tests never open it).
  historyCommits?: Array<{
    hash: string;
    author: { name: string; email: string };
    date: string;
    message: string;
    isCheckpoint: boolean;
  }>;
}

function installFakeEditorApi(initial: FakeState) {
  const state: FakeState = { ...initial };
  let etagCounter = 1;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('/theme/schemas')) {
      return new Response(
        JSON.stringify({
          sections: { hero: { type: 'object', properties: { heading: { type: 'string' } } } },
          blocks: {},
          acceptsBlocks: { sections: { hero: false }, blocks: {} },
        }),
        { status: 200 },
      );
    }

    // The listing endpoint (no path segment after /content) - checked
    // ahead of the single-item read below, which always has one.
    if (method === 'GET' && /\/content(\?|$)/.test(url)) {
      const entries = (state.contentList ?? []).map((entry) => ({
        path: entry.path,
        name: entry.path,
        title: entry.path,
        type: 'page',
        published: true,
        hasDraft: false,
        url: entry.url,
        changedAt: null,
      }));
      return new Response(JSON.stringify(entries), { status: 200 });
    }

    if (method === 'GET' && url.includes('/content/')) {
      if (state.content === null || state.etag === null) {
        return new Response(JSON.stringify({ error: 'not found', reason: 'not-found' }), { status: 404 });
      }
      return new Response(state.content, {
        status: 200,
        headers: { etag: state.etag, 'x-content-source': state.source, 'content-type': 'application/json' },
      });
    }

    if (method === 'PUT' && url.includes('/drafts/')) {
      const headers = init?.headers as Record<string, string>;
      const ifMatch = headers['If-Match'];
      if (ifMatch !== state.etag) {
        return new Response(JSON.stringify({ statusCode: 409, error: 'Conflict', message: 'stale' }), {
          status: 409,
        });
      }
      if (state.forceDraftSaveError) {
        return new Response(
          JSON.stringify({ statusCode: 400, error: 'Bad Request', message: 'must have required property \'name\'' }),
          { status: 400 },
        );
      }
      state.content = init?.body as string;
      etagCounter += 1;
      state.etag = `"etag-${etagCounter}"`;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: state.etag } });
    }

    // G1: publish moves the current draft to live - content stays
    // the same (that's what was drafted), only the source label
    // flips, matching the real agent's own draft-to-live move.
    if (method === 'POST' && url.endsWith('/publish')) {
      const body = JSON.parse(init?.body as string) as { path: string; message: string };
      if (!body.message?.trim()) {
        return new Response(JSON.stringify({ error: 'path and message are both required' }), { status: 400 });
      }
      if (state.forceActionFailure) {
        return new Response(JSON.stringify({ error: 'Could not reach the site', reason: 'unreachable' }), {
          status: 502,
        });
      }
      if (state.content === null) {
        return new Response(JSON.stringify({ error: 'not found', reason: 'not-found' }), { status: 404 });
      }
      state.source = 'live';
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // G3: idempotent - reverts to whatever liveContent/liveEtag a
    // test configured (or just flips source if it didn't).
    if (method === 'DELETE' && url.includes('/drafts/')) {
      if (state.liveContent !== undefined) {
        state.content = state.liveContent;
        state.etag = state.liveEtag ?? state.etag;
      }
      state.source = 'live';
      return new Response(null, { status: 204 });
    }

    if (method === 'GET' && url.includes('/history/')) {
      return new Response(JSON.stringify({ commits: state.historyCommits ?? [], hasMore: false }), { status: 200 });
    }

    if (method === 'POST' && url.endsWith('/revert')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { state, fetchMock };
}

// PageEditorPage uses useAutosaveDraft's real production debounce
// (1000ms) - it has no override, unlike the hook's own tests, since
// adding one would mean threading test-only plumbing into the
// component for no reason the real app needs. RTL's default waitFor
// timeout (1000ms) races that, so anything that must outlast a real
// debounce cycle gets an explicit longer timeout instead.
const PAST_DEBOUNCE = { timeout: 2000 };

// Simulates dragging fromHandle onto toRow, landing in either the top
// or bottom half of toRow's (mocked, since jsdom never lays anything
// out) bounding rect.
function dragOnto(fromHandle: HTMLElement, toRow: HTMLElement, half: 'top' | 'bottom'): void {
  vi.spyOn(toRow, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    height: 40,
    bottom: 40,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  fireEvent.dragStart(fromHandle);
  fireEvent.dragOver(toRow, { clientY: half === 'top' ? 5 : 35 });
  fireEvent.drop(toRow);
}

// createMemoryRouter/RouterProvider, not the plain <MemoryRouter>/
// <Routes> this used before - useBlocker (guarding navigation away
// from a page with unpublished changes) only works under a data
// router, and throws otherwise. editorRouteExtra renders alongside
// PageEditorPage on its own route - used only by the tests proving the
// blocker also catches a genuine ROUTE change (not just the preview-
// link search-param kind), standing in for a real link elsewhere in
// the app (e.g. AppShell's top nav) without needing to render AppShell
// itself here.
function renderPage(initialEntry = '/sites/site-1/editor?path=pages%2Fabout.json', editorRouteExtra: ReactNode = null) {
  const router = createMemoryRouter(
    [
      {
        path: '/sites/:siteId/editor',
        element: (
          <>
            <PageEditorPage />
            {editorRouteExtra}
          </>
        ),
      },
      { path: '/', element: <div>registry home</div> },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(
    <TestPageActionsHost>
      <RouterProvider router={router} />
    </TestPageActionsHost>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  // vi.spyOn(window, 'confirm'/'open') elsewhere in this file returns
  // the SAME accumulated mock (with its prior call history) on every
  // repeat call within a file unless explicitly restored - vitest 3
  // apparently reset this implicitly between tests, vitest 4 does not.
  vi.restoreAllMocks();
});

// Save/Discard render into the page-actions slot (TestPageActionsHost
// above, standing in for AppShell's own top bar) one commit after
// Content itself appears in the tree - waiting for Content alone is
// not enough of a guarantee before interacting with either button.
async function waitForActions(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Discard Changes' })).toBeDefined());
}

describe('PageEditorPage', () => {
  it('E1: loads and shows the current content and source', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });

    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Hi"}');
    // A draft already exists on load, so Save/Discard are showing.
    // These render in the page's own footer via a separate effect,
    // one commit after Content itself appears - waited for explicitly
    // rather than assumed simultaneous.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard Changes' })).toBeDefined());
  });

  it('E2, E3: editing autosaves without an explicit save action', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Content'), { target: { value: '{"title":"Edited"}' } });

    // "name" (absent here) is backfilled from "title" before every
    // save - content saved before Group J required it must not fail
    // validation on the very next edit.
    await waitFor(
      () => expect(api.state.content).toBe(JSON.stringify({ title: 'Edited', name: 'Edited' }, null, 2)),
      PAST_DEBOUNCE,
    );
    // Once the autosave lands, status returns to 'ready' - Save is
    // no longer disabled by an in-flight/dirty state.
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Save Changes' })).toHaveProperty('disabled', false),
      PAST_DEBOUNCE,
    );
  });

  it('does not backfill "name" for a post - posts have no "name" property and reject unknown ones', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage('/sites/site-1/editor?path=posts%2Fhello-world.json');
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Content'), { target: { value: '{"title":"Edited"}' } });

    await waitFor(() => expect(api.state.content).toBe('{"title":"Edited"}'), PAST_DEBOUNCE);
  });

  it('Save Changes is disabled while the last save failed, so publishing a draft that was never actually saved is impossible', async () => {
    installFakeEditorApi({
      content: '{"title":"Hi","name":"Hi"}',
      etag: '"etag-1"',
      source: 'draft',
      forceDraftSaveError: true,
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Content'), { target: { value: '{"title":"Edited","name":"Edited"}' } });

    await waitFor(() => expect(screen.getByText('must have required property \'name\'')).toBeDefined(), PAST_DEBOUNCE);
    expect(screen.getByRole('button', { name: 'Save Changes' })).toHaveProperty('disabled', true);
  });

  it('shows a clear message while JSON is invalid, and never sends it', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Content'), { target: { value: '{"title": not valid' } });

    await waitFor(() => expect(screen.getByText('Not valid JSON yet - not saved.')).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(api.state.content).toBe('{"title":"Hi"}');
  });

  it('E4: a conflict shows a clear message, not a generic error', async () => {
    const api = installFakeEditorApi({ content: '{"a":1}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    api.state.etag = '"etag-99"';
    api.state.content = '{"a":"someone-else"}';
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: '{"a":"mine"}' } });

    await waitFor(() => expect(screen.getByText('This page changed since you opened it.')).toBeDefined(), PAST_DEBOUNCE);
  });

  it('E5: "View changes" shows both versions without discarding local edits', async () => {
    const api = installFakeEditorApi({ content: '{"a":1}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    api.state.etag = '"etag-99"';
    api.state.content = '{"a":"latest"}';
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: '{"a":"mine"}' } });
    await waitFor(() => expect(screen.getByText('This page changed since you opened it.')).toBeDefined(), PAST_DEBOUNCE);

    fireEvent.click(screen.getByRole('button', { name: 'View changes' }));

    await waitFor(() => expect(screen.getByText('{"a":"latest"}')).toBeDefined());
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"a":"mine"}');
  });

  it('E5: "Reload latest version" discards local edits and re-fetches', async () => {
    const api = installFakeEditorApi({ content: '{"a":1}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    api.state.etag = '"etag-99"';
    api.state.content = '{"a":"latest"}';
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: '{"a":"mine"}' } });
    await waitFor(() => expect(screen.getByText('This page changed since you opened it.')).toBeDefined(), PAST_DEBOUNCE);

    fireEvent.click(screen.getByRole('button', { name: 'Reload latest version' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"a":"latest"}'),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toHaveProperty('disabled', false));
  });

  it('shows a clear message when nothing exists at this path', async () => {
    installFakeEditorApi({ content: null, etag: null, source: 'draft' });
    renderPage();

    await waitFor(() => expect(screen.getByText('No content found at this path.')).toBeDefined());
  });

  it('F1: renders a preview iframe pointed at the proxy preview route when a url is present', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');

    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview/about?t=');
  });

  it('shows a fallback message instead of an iframe when there is no url (e.g. a menu)', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage('/sites/site-1/editor?path=menus%2Fmain.json');

    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    expect(screen.getByText('No live preview available for this content type.')).toBeDefined();
    expect(screen.queryByTitle('Live preview')).toBeNull();
  });

  it('the device-size toggle renders into the shared top bar\'s own slot, not PreviewFrame\'s own (there is no PreviewFrame-owned top bar any more), and changing it resizes the iframe', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    const toggle = document.querySelector('.app-topbar-device-toggle') as HTMLElement;
    expect(toggle.querySelector('[role="group"]')).toBeDefined();

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('100%');

    fireEvent.click(screen.getByRole('button', { name: 'Mobile preview' }));

    expect(iframe.style.width).toBe('375px');
  });

  it('shows no device toggle when there is no live preview for this content (e.g. a menu)', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage('/sites/site-1/editor?path=menus%2Fmain.json');
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    const toggle = document.querySelector('.app-topbar-device-toggle') as HTMLElement;
    expect(toggle.querySelector('[role="group"]')).toBeNull();
  });

  it('opening the phone-only preview toggle hides Discard/Save Changes, and closing it brings them back - found live: the bar they share a screen edge with otherwise sits on top of Close Preview', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.queryByRole('button', { name: 'Discard Changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close Preview' }));

    await waitForActions();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDefined();
  });

  it('G1: publishing sends an auto-generated message with no prompt, then reflects the page as now-live', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(api.state.source).toBe('live'));
    // No draft left and nothing dirty/in-flight - Save/Discard drop
    // out of the header entirely.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Discard Changes' })).toBeNull();
  });

  it('G5: a failed publish leaves the draft state untouched and shows an inline error', async () => {
    const api = installFakeEditorApi({
      content: '{"title":"Hi"}',
      etag: '"etag-1"',
      source: 'draft',
      forceActionFailure: true,
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.getByText('Could not reach the site')).toBeDefined());
    expect(api.state.source).toBe('draft');
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Hi"}');
  });

  it('G3: discard is confirmed first (a styled popup, not window.confirm); declining makes no call at all', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeDefined());

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.state.source).toBe('draft');
  });

  it('G3: confirming discard (via the popup) returns the editor to the live version', async () => {
    const api = installFakeEditorApi({
      content: '{"title":"My edit"}',
      etag: '"etag-1"',
      source: 'draft',
      liveContent: '{"title":"Live version"}',
      liveEtag: '"live-etag"',
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeDefined());
    expect(screen.getByText('Discard the draft and return to the live version? This cannot be undone.')).toBeDefined();

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard Changes' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Live version"}'),
    );
    expect(api.state.source).toBe('live');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Group I: content with no sections array falls back to the raw view, with the Sections tab disabled', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    expect(screen.getByRole('tab', { name: 'Sections' })).toHaveProperty('disabled', true);
  });

  it('Group I: sections content defaults to the structured editor, driving the same autosave path', async () => {
    const api = installFakeEditorApi({
      content: JSON.stringify({
        title: 'Hi',
        published: true,
        sections: [
          { id: 'a', type: 'hero', settings: {} },
          { id: 'b', type: 'hero', settings: {} },
        ],
      }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Section' })).toBeDefined());
    expect(screen.queryByLabelText('Content')).toBeNull();

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);
    dragOnto(handles[0] as HTMLElement, rows[1] as HTMLElement, 'bottom');

    await waitFor(
      () => expect(JSON.parse(api.state.content ?? '{}').sections.map((s: { id: string }) => s.id)).toEqual(['b', 'a']),
      PAST_DEBOUNCE,
    );
  });

  it('hovering a section row outlines the matching element in the live preview iframe and scrolls it into view, and leaving clears the outline', async () => {
    installFakeEditorApi({
      content: JSON.stringify({
        title: 'Hi',
        published: true,
        sections: [
          { id: 'a', type: 'hero', settings: {} },
          { id: 'b', type: 'hero', settings: {} },
        ],
      }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Section' })).toBeDefined());

    // jsdom never actually navigates the iframe to its real src, so the
    // real site's rendered HTML (which does carry data-section-id, per
    // every theme template) is stood in for here directly.
    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    const doc = iframe.contentDocument as Document;
    // jsdom never navigates the iframe, so its document has no <body>
    // yet (unlike a real browser's about:blank) - write one in.
    doc.open();
    doc.write('<body></body>');
    doc.close();
    const sectionA = doc.createElement('div');
    sectionA.dataset.sectionId = 'a';
    const sectionB = doc.createElement('div');
    sectionB.dataset.sectionId = 'b';
    doc.body.append(sectionA, sectionB);
    const scrollIntoViewA = vi.fn();
    sectionA.scrollIntoView = scrollIntoViewA;
    const scrollIntoViewB = vi.fn();
    sectionB.scrollIntoView = scrollIntoViewB;

    const rows = screen.getAllByRole('button', { name: 'Edit hero' });
    fireEvent.mouseEnter(rows[0] as HTMLElement);
    expect(sectionA.style.outline).toBe('2px solid #3b6ef6');
    expect(sectionB.style.outline).toBe('');
    expect(scrollIntoViewA).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(scrollIntoViewB).not.toHaveBeenCalled();

    fireEvent.mouseLeave(rows[0] as HTMLElement);
    expect(sectionA.style.outline).toBe('');
  });

  it('hovering a section in the live preview itself highlights the matching row in the sidebar', async () => {
    installFakeEditorApi({
      content: JSON.stringify({
        title: 'Hi',
        published: true,
        sections: [
          { id: 'a', type: 'hero', settings: {} },
          { id: 'b', type: 'hero', settings: {} },
        ],
      }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Section' })).toBeDefined());

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    const doc = iframe.contentDocument as Document;
    doc.open();
    doc.write('<body></body>');
    doc.close();
    // A nested child (not the section element itself) - proves the
    // delegated listener walks up via closest(), matching what a real
    // theme section's own inner markup looks like.
    const sectionA = doc.createElement('div');
    sectionA.dataset.sectionId = 'a';
    const heading = doc.createElement('h1');
    sectionA.append(heading);
    const sectionB = doc.createElement('div');
    sectionB.dataset.sectionId = 'b';
    doc.body.append(sectionA, sectionB);
    // jsdom fires the iframe's own load event once its (blank)
    // document is ready, which is when PageEditorPage attaches its
    // delegated listeners - firing it again here (now that the fake
    // section markup above actually exists) guarantees it happens
    // against this exact content, rather than depending on timing.
    fireEvent.load(iframe);

    const rows = screen.getAllByRole('button', { name: 'Edit hero' });
    expect(rows[0]?.className).not.toContain('is-highlighted');

    fireEvent.mouseOver(heading);
    await waitFor(() => expect(rows[0]?.className).toContain('is-highlighted'));
    expect(rows[1]?.className).not.toContain('is-highlighted');

    fireEvent.mouseOut(heading, { relatedTarget: doc.body });
    await waitFor(() => expect(rows[0]?.className).not.toContain('is-highlighted'));
  });

  it('the pointer leaving the preview iframe entirely (not just moving between sections within it) also clears the highlighted row', async () => {
    installFakeEditorApi({
      content: JSON.stringify({
        title: 'Hi',
        published: true,
        sections: [{ id: 'a', type: 'hero', settings: {} }],
      }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Section' })).toBeDefined());

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    const doc = iframe.contentDocument as Document;
    doc.open();
    doc.write('<body></body>');
    doc.close();
    const sectionA = doc.createElement('div');
    sectionA.dataset.sectionId = 'a';
    doc.body.append(sectionA);
    fireEvent.load(iframe);

    fireEvent.mouseOver(sectionA);
    const row = screen.getByRole('button', { name: 'Edit hero' });
    await waitFor(() => expect(row.className).toContain('is-highlighted'));

    // Real browsers don't reliably fire mouseout with a usable
    // relatedTarget when the pointer leaves the iframe's own document
    // for a different part of the parent page (confirmed live) - this
    // is deliberately a plain mouseleave dispatched on the iframe
    // element itself, the separate native listener that covers exactly
    // that gap, not a mouseout inside the previewed document.
    fireEvent.mouseLeave(iframe);
    await waitFor(() => expect(row.className).not.toContain('is-highlighted'));
  });

  // The url -> path index is fetched in parallel with the page's own
  // content on mount - waiting for the real network call it drives
  // (rather than just the "Add Section" button, which only proves the
  // page's own content loaded) avoids a race where a test clicks a
  // preview link before the index exists yet, which would make every
  // link look unresolvable.
  async function waitForContentIndexLoaded(fetchMock: ReturnType<typeof vi.fn>): Promise<void> {
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => {
          const input = call[0] as RequestInfo | URL;
          return /\/content(\?|$)/.test(typeof input === 'string' ? input : input.toString());
        }),
      ).toBe(true),
    );
  }

  function writeIframeDocWithLink(iframe: HTMLIFrameElement, linkHref: string): { doc: Document; link: HTMLAnchorElement } {
    const doc = iframe.contentDocument as Document;
    doc.open();
    // The real preview response carries <base href="{site.url}/">
    // (site-preview.ts) so relative theme links resolve to the site's
    // own origin - reproduced here since jsdom never actually
    // navigates the iframe to fetch this for real.
    doc.write('<head><base href="http://localhost:3891/"></head><body></body>');
    doc.close();
    const link = doc.createElement('a');
    link.setAttribute('href', linkHref);
    link.textContent = 'link';
    doc.body.append(link);
    fireEvent.load(iframe);
    return { doc, link };
  }

  it('clicking a preview link to another page this CMS manages switches both the iframe and the admin to it, when nothing is pending', async () => {
    const api = installFakeEditorApi({
      content: JSON.stringify({ title: 'About', published: true, sections: [] }),
      etag: '"etag-1"',
      // 'live', not 'draft' - hasPendingChanges must be false here so
      // the blocker never fires, proving a clean page navigates freely.
      source: 'live',
      contentList: [
        { path: 'pages/about.json', url: '/about' },
        { path: 'pages/docs.json', url: '/docs' },
      ],
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Section' })).toBeDefined());
    await waitForContentIndexLoaded(api.fetchMock);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    const { link } = writeIframeDocWithLink(iframe, '/docs');

    fireEvent.click(link);

    await waitFor(() => expect(iframe.src).toContain('/api/sites/site-1/preview/docs?t='));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  describe('a page with unpublished changes (source: draft) blocks navigating away', () => {
    function setUpDirtyPage() {
      const api = installFakeEditorApi({
        content: JSON.stringify({ title: 'About', published: true, sections: [] }),
        etag: '"etag-1"',
        source: 'draft',
        contentList: [
          { path: 'pages/about.json', url: '/about' },
          { path: 'pages/docs.json', url: '/docs' },
        ],
      });
      return api;
    }

    it('prompts before following a preview link to another page, and Cancel leaves everything untouched', async () => {
      const api = setUpDirtyPage();
      renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
      await waitForActions();
      await waitForContentIndexLoaded(api.fetchMock);

      const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
      const { link } = writeIframeDocWithLink(iframe, '/docs');
      const originalSrc = iframe.src;

      fireEvent.click(link);
      await waitFor(() => expect(screen.getByRole('alertdialog')).toBeDefined());
      expect(screen.getByText(/haven't been published yet/)).toBeDefined();

      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(iframe.src).toBe(originalSrc);
    });

    it('Save Changes publishes the current page, then proceeds to the page that was clicked', async () => {
      const api = setUpDirtyPage();
      renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
      await waitForActions();
      await waitForContentIndexLoaded(api.fetchMock);

      const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
      const { link } = writeIframeDocWithLink(iframe, '/docs');

      fireEvent.click(link);
      await waitFor(() => expect(screen.getByRole('alertdialog')).toBeDefined());

      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => expect(api.state.source).toBe('live'));
      await waitFor(() => expect(iframe.src).toContain('/api/sites/site-1/preview/docs?t='));
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('Discard Changes reverts the draft with no extra native confirm, then proceeds to the page that was clicked', async () => {
      const api = setUpDirtyPage();
      const confirmSpy = vi.spyOn(window, 'confirm');
      renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
      await waitForActions();
      await waitForContentIndexLoaded(api.fetchMock);

      const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
      const { link } = writeIframeDocWithLink(iframe, '/docs');

      fireEvent.click(link);
      await waitFor(() => expect(screen.getByRole('alertdialog')).toBeDefined());

      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard Changes' }));

      await waitFor(() => expect(api.state.source).toBe('live'));
      await waitFor(() => expect(iframe.src).toContain('/api/sites/site-1/preview/docs?t='));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      // The UnsavedChangesPrompt IS the confirmation here - a second,
      // native window.confirm on top (useDraftPublishActions' own
      // standalone Discard Changes button still has one) would just
      // be an annoying re-ask of a choice already made explicitly.
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('also blocks a genuine route change elsewhere in the app (e.g. the top nav), not just the preview-link search-param kind', async () => {
      const api = setUpDirtyPage();
      renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout', <Link to="/">Pages</Link>);
      await waitForActions();
      void api;

      fireEvent.click(screen.getByRole('link', { name: 'Pages' }));

      await waitFor(() => expect(screen.getByRole('alertdialog')).toBeDefined());
      expect(screen.queryByText('registry home')).toBeNull();

      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryByText('registry home')).toBeNull();
    });
  });

  it('clicking a preview link to a page outside this CMS opens it in a new tab instead of navigating the preview or the admin', async () => {
    const api = installFakeEditorApi({
      content: JSON.stringify({ title: 'About', published: true, sections: [] }),
      etag: '"etag-1"',
      source: 'draft',
      contentList: [{ path: 'pages/about.json', url: '/about' }],
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Section' })).toBeDefined());
    await waitForContentIndexLoaded(api.fetchMock);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    const { link } = writeIframeDocWithLink(iframe, 'https://example.com/pricing');
    const originalSrc = iframe.src;

    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    fireEvent.click(link);

    expect(openSpy).toHaveBeenCalledWith('https://example.com/pricing', '_blank', 'noopener,noreferrer');
    expect(iframe.src).toBe(originalSrc);
  });

  it('the edit panel renders before the preview in the DOM, matching the revised design\'s panel-left/preview-right layout', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    const shell = screen.getByLabelText('Content').closest('.editor-shell') as HTMLElement;
    const sidebar = shell.querySelector('.editor-sidebar') as Node;
    const preview = shell.querySelector('.editor-preview-full') as Node;
    const position = sidebar.compareDocumentPosition(preview);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('a Page tab is available alongside Sections, showing Page title (seeded from real content) plus placeholder page-attribute fields', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('tab', { name: 'Page Meta' }));

    expect(screen.getByText('Page attributes')).toBeDefined();
    expect((screen.getByLabelText('Page title') as HTMLInputElement).value).toBe('Hi');
    expect(screen.getByLabelText('Page meta description')).toBeDefined();
    expect(screen.getByLabelText('Author')).toBeDefined();
    expect(screen.getByLabelText('Publish date')).toBeDefined();
    expect(screen.getByLabelText('Status')).toBeDefined();
  });

  it('editing Page title on the Page tab saves through the same autosave path as everything else - it is no longer duplicated under Sections', async () => {
    const api = installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: {} }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Section' })).toBeDefined());

    // Already on the Sections tab (the default) - Title isn't here any more.
    expect(screen.queryByLabelText('Title')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Page Meta' }));
    fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'A new title' } });

    expect((screen.getByLabelText('Page title') as HTMLInputElement).value).toBe('A new title');
    await waitFor(() => expect(JSON.parse(api.state.content ?? '{}').title).toBe('A new title'), PAST_DEBOUNCE);
  });

  it('the remaining Page tab placeholder fields (meta description, author, publish date, status) are locally interactive but not wired to real content yet', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('tab', { name: 'Page Meta' }));
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Ada Lovelace' } });

    expect((screen.getByLabelText('Author') as HTMLInputElement).value).toBe('Ada Lovelace');
  });

  it('the Fields panel is not shown until a section has been clicked to edit', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: { heading: 'Hi there' } }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    expect(screen.queryByLabelText('heading')).toBeNull();
  });

  it('clicking a section opens its own Fields panel on the right, seeded with its settings - a separate panel now, not a third tab sharing the left column', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: { heading: 'Hi there' } }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));

    await waitFor(() => expect((screen.getByLabelText('Heading') as HTMLInputElement).value).toBe('Hi there'));
    // Still there, untouched - the Sections list and the Fields panel
    // are independent now, not two states of the one column.
    expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined();
  });

  it('editing a field in the Fields panel saves through the same autosave path as everything else', async () => {
    const api = installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: { heading: 'Hi there' } }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));
    await waitFor(() => expect(screen.getByLabelText('Heading')).toBeDefined());
    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'Changed heading' } });

    await waitFor(
      () => expect(JSON.parse(api.state.content ?? '{}').sections[0].settings.heading).toBe('Changed heading'),
      PAST_DEBOUNCE,
    );
  });

  it('switching between the Page Meta and Sections tabs on the left leaves the Fields panel on the right open - they are independent now', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: { heading: 'Hi there' } }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));
    await waitFor(() => expect(screen.getByLabelText('Heading')).toBeDefined());

    fireEvent.click(screen.getByRole('tab', { name: 'Page Meta' }));
    expect((screen.getByLabelText('Heading') as HTMLInputElement).value).toBe('Hi there');

    fireEvent.click(screen.getByRole('tab', { name: 'Sections' }));
    expect((screen.getByLabelText('Heading') as HTMLInputElement).value).toBe('Hi there');
  });

  it('closing the Fields panel via its own close button clears the selection', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: { heading: 'Hi there' } }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));
    await waitFor(() => expect(screen.getByLabelText('Heading')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByLabelText('heading')).toBeNull();
  });

  const HISTORY_COMMIT = {
    hash: 'abc123',
    author: { name: 'Jane Editor', email: 'jane@example.com' },
    date: '2026-01-01T00:00:00.000Z',
    message: 'Update about page',
    isCheckpoint: false,
  };

  it('the History tab lists commits, and clicking one renders that revision in the preview viewport', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [] }),
      etag: '"etag-1"',
      source: 'draft',
      historyCommits: [HISTORY_COMMIT],
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');

    await waitFor(() => expect(screen.getByTitle('Live preview')).toBeDefined());
    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview/about?t=');

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    await waitFor(() => expect(screen.getByText('Update about page')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Preview version from 1 Jan 2026' }));

    await waitFor(() => expect(iframe.src).toContain('/api/sites/site-1/preview-revision/abc123/about'));
  });

  it('leaving the History tab reverts the preview to the current version', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [] }),
      etag: '"etag-1"',
      source: 'draft',
      historyCommits: [HISTORY_COMMIT],
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    await waitFor(() => expect(screen.getByTitle('Live preview')).toBeDefined());
    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    await waitFor(() => expect(screen.getByText('Update about page')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Preview version from 1 Jan 2026' }));
    await waitFor(() => expect(iframe.src).toContain('/preview-revision/abc123/about'));

    fireEvent.click(screen.getByRole('tab', { name: 'Page Meta' }));

    await waitFor(() => expect(iframe.src).toContain('/api/sites/site-1/preview/about?t='));
  });

  it('the History tab\'s own "Back to current version" control also reverts the preview, without leaving the tab', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [] }),
      etag: '"etag-1"',
      source: 'draft',
      historyCommits: [HISTORY_COMMIT],
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    await waitFor(() => expect(screen.getByTitle('Live preview')).toBeDefined());
    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    await waitFor(() => expect(screen.getByText('Update about page')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Preview version from 1 Jan 2026' }));
    await waitFor(() => expect(iframe.src).toContain('/preview-revision/abc123/about'));

    fireEvent.click(screen.getByText('← Back to current version'));

    await waitFor(() => expect(iframe.src).toContain('/api/sites/site-1/preview/about?t='));
    // Still on the History tab - only the preview reverted.
    expect(screen.getByText('Update about page')).toBeDefined();
  });

  it('Save/Discard actions are hidden while previewing a historical revision', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [] }),
      etag: '"etag-1"',
      source: 'draft',
      historyCommits: [HISTORY_COMMIT],
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    await waitForActions();

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    await waitFor(() => expect(screen.getByText('Update about page')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Preview version from 1 Jan 2026' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Discard Changes' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
  });

  it('clicking a section in the preview is a no-op while previewing a historical revision', async () => {
    installFakeEditorApi({
      content: JSON.stringify({
        title: 'Hi',
        published: true,
        sections: [{ id: 'a', type: 'hero', settings: {} }],
      }),
      etag: '"etag-1"',
      source: 'draft',
      historyCommits: [HISTORY_COMMIT],
    });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Section' })).toBeDefined());

    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    await waitFor(() => expect(screen.getByText('Update about page')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Preview version from 1 Jan 2026' }));

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    await waitFor(() => expect(iframe.src).toContain('/preview-revision/abc123/about'));
    const doc = iframe.contentDocument as Document;
    doc.open();
    doc.write('<body></body>');
    doc.close();
    const sectionA = doc.createElement('div');
    sectionA.dataset.sectionId = 'a';
    doc.body.append(sectionA);
    fireEvent.load(iframe);

    fireEvent.click(sectionA);

    // No Fields panel opened - suppressed rather than acting against
    // the current draft's own (possibly mismatched) section ids.
    expect(screen.queryByLabelText('Heading')).toBeNull();
  });
});
