import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PageEditorPage } from '../../src/pages/PageEditorPage.tsx';

interface FakeState {
  content: string | null;
  etag: string | null;
  source: 'draft' | 'live';
}

function installFakeEditorApi(initial: FakeState) {
  const state: FakeState = { ...initial };
  let etagCounter = 1;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

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
      state.content = init?.body as string;
      etagCounter += 1;
      state.etag = `"etag-${etagCounter}"`;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: state.etag } });
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

describe('PageEditorPage', () => {
  it('E1: loads and shows the current content and source', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });

    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Hi"}');
    expect(screen.getByText('draft', { exact: false })).toBeDefined();
  });

  it('E2, E3: editing autosaves without an explicit save action', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Content'), { target: { value: '{"title":"Edited"}' } });

    await waitFor(() => expect(api.state.content).toBe('{"title":"Edited"}'), PAST_DEBOUNCE);
    await waitFor(() => expect(screen.getByText('Saved')).toBeDefined(), PAST_DEBOUNCE);
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
    expect(screen.getByText('Saved')).toBeDefined();
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
});
