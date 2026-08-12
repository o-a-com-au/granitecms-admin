import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PageEditorPage } from '../../src/pages/PageEditorPage.tsx';

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

    // PreviewFrame's own address bar reads the registered domain via
    // useSites() - PageEditorPage has no dedicated single-site fetch
    // to call instead (see the component's own comment on why).
    if (method === 'GET' && url === '/api/sites') {
      return new Response(
        JSON.stringify([
          {
            id: 'site-1',
            url: 'http://localhost:3891',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            status: { state: 'ok', agentVersion: '0.0.0', contentSchemaVersion: 4, sqliteDriver: 'node:sqlite' },
          },
        ]),
        { status: 200 },
      );
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

    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { state };
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

function renderPage(initialEntry = '/sites/site-1/editor?path=pages%2Fabout.json') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/sites/:siteId/editor" element={<PageEditorPage />} />
        <Route path="/" element={<div>registry home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Save/Discard render in PageEditorPage's own footer (no shared
// AppShell header any more), one commit after Content itself appears
// in the tree - waiting for Content alone is not enough of a
// guarantee before interacting with either button.
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

  it("shows the site's registered domain joined with the page's relative path above the preview", async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage('/sites/site-1/editor?path=pages%2Fabout.json&url=%2Fabout');

    await waitFor(() => expect(screen.getByText('http://localhost:3891/about')).toBeDefined());
  });

  it('shows a fallback message instead of an iframe when there is no url (e.g. a menu)', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage('/sites/site-1/editor?path=menus%2Fmain.json');

    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    expect(screen.getByText('No live preview available for this content type.')).toBeDefined();
    expect(screen.queryByTitle('Live preview')).toBeNull();
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

  it('G3: discard is confirmed first; declining makes no call at all', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.state.source).toBe('draft');
  });

  it('G3: confirming discard returns the editor to the live version', async () => {
    const api = installFakeEditorApi({
      content: '{"title":"My edit"}',
      etag: '"etag-1"',
      source: 'draft',
      liveContent: '{"title":"Live version"}',
      liveEtag: '"live-etag"',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    await waitForActions();

    fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Live version"}'),
    );
    expect(api.state.source).toBe('live');
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

  it('the preview panel renders before the edit panel in the DOM, matching the design\'s preview-left/panel-right layout', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    const shell = screen.getByLabelText('Content').closest('.editor-shell') as HTMLElement;
    const preview = shell.querySelector('.editor-preview-full') as Node;
    const sidebar = shell.querySelector('.editor-sidebar') as Node;
    const position = preview.compareDocumentPosition(sidebar);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('a Page tab is available alongside Sections, showing Page title (seeded from real content) plus placeholder page-attribute fields', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('tab', { name: 'Page' }));

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

    fireEvent.click(screen.getByRole('tab', { name: 'Page' }));
    fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'A new title' } });

    expect((screen.getByLabelText('Page title') as HTMLInputElement).value).toBe('A new title');
    await waitFor(() => expect(JSON.parse(api.state.content ?? '{}').title).toBe('A new title'), PAST_DEBOUNCE);
  });

  it('the remaining Page tab placeholder fields (meta description, author, publish date, status) are locally interactive but not wired to real content yet', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('tab', { name: 'Page' }));
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Ada Lovelace' } });

    expect((screen.getByLabelText('Author') as HTMLInputElement).value).toBe('Ada Lovelace');
  });

  it('the Fields tab is not shown until a section has been clicked to edit', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: { heading: 'Hi there' } }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    expect(screen.queryByRole('tab', { name: 'Fields' })).toBeNull();
  });

  it('clicking "Edit fields" on a section shows the Fields tab, switches to it, and shows that section\'s own field', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: { heading: 'Hi there' } }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));

    expect(screen.getByRole('tab', { name: 'Fields' })).toHaveProperty('ariaSelected', 'true');
    expect((screen.getByLabelText('heading') as HTMLInputElement).value).toBe('Hi there');
  });

  it('editing a field in the Fields tab saves through the same autosave path as everything else', async () => {
    const api = installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: { heading: 'Hi there' } }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));
    fireEvent.change(screen.getByLabelText('heading'), { target: { value: 'Changed heading' } });

    await waitFor(
      () => expect(JSON.parse(api.state.content ?? '{}').sections[0].settings.heading).toBe('Changed heading'),
      PAST_DEBOUNCE,
    );
  });

  it('switching back to the Sections tab and then to Fields again keeps showing the same selected section', async () => {
    installFakeEditorApi({
      content: JSON.stringify({ title: 'Hi', published: true, sections: [{ id: 'a', type: 'hero', settings: { heading: 'Hi there' } }] }),
      etag: '"etag-1"',
      source: 'draft',
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));
    expect(screen.getByLabelText('heading')).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: 'Sections' }));
    expect(screen.queryByLabelText('heading')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Fields' }));
    expect((screen.getByLabelText('heading') as HTMLInputElement).value).toBe('Hi there');
  });
});
