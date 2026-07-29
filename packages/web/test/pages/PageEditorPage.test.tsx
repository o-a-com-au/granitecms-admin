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
  // G5: forces publish/unpublish itself to fail with a real 502,
  // independent of content nullity - the initial load still succeeds.
  forceActionFailure?: boolean;
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

    // G4: sets published:false on the live JSON in place, matching
    // the real agent - the content stays, only the flag changes.
    if (method === 'POST' && url.includes('/unpublish/')) {
      const body = JSON.parse(init?.body as string) as { message: string };
      if (!body.message?.trim()) {
        return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 });
      }
      if (state.forceActionFailure) {
        return new Response(JSON.stringify({ error: 'Could not reach the site', reason: 'unreachable' }), {
          status: 502,
        });
      }
      if (state.content === null) {
        return new Response(JSON.stringify({ error: 'not found', reason: 'not-found' }), { status: 404 });
      }
      const parsed = JSON.parse(state.content) as Record<string, unknown>;
      parsed.published = false;
      state.content = JSON.stringify(parsed);
      etagCounter += 1;
      state.etag = `"etag-${etagCounter}"`;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
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
    expect(screen.getByText('draft', { selector: 'code' })).toBeDefined();
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

  it('G1: publishing prompts for a message, then reflects the page as now-live', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    vi.spyOn(window, 'prompt').mockReturnValue('Ship the about page');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(api.state.source).toBe('live'));
    await waitFor(() => expect(screen.getByText('live', { selector: 'code' })).toBeDefined());
  });

  it('G1: cancelling the publish prompt makes no call at all', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.state.source).toBe('draft');
  });

  it('G1, G5: a blank publish message is rejected client-side, leaving draft state untouched', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(screen.getByText('A commit message is required to publish.')).toBeDefined());
    expect(api.state.source).toBe('draft');
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Hi"}');
  });

  it('G5: a failed publish leaves the draft state untouched and shows an inline error', async () => {
    const api = installFakeEditorApi({
      content: '{"title":"Hi"}',
      etag: '"etag-1"',
      source: 'draft',
      forceActionFailure: true,
    });
    vi.spyOn(window, 'prompt').mockReturnValue('Ship it');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(screen.getByText('Could not reach the site')).toBeDefined());
    expect(api.state.source).toBe('draft');
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Hi"}');
  });

  it('G3: discard is confirmed first; declining makes no call at all', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Live version"}'),
    );
    expect(api.state.source).toBe('live');
  });

  it('G4: unpublishing prompts for a message, then flips published to false on the live content', async () => {
    const api = installFakeEditorApi({
      content: '{"title":"Hi","published":true}',
      etag: '"etag-1"',
      source: 'live',
    });
    vi.spyOn(window, 'prompt').mockReturnValue('Taking this offline');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(JSON.parse(api.state.content ?? '{}').published).toBe(false));
    await waitFor(() =>
      expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toContain('"published":false'),
    );
  });

  it('G4, G5: a blank unpublish message is rejected client-side, leaving state untouched', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'live' });
    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(screen.getByText('A commit message is required to unpublish.')).toBeDefined());
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Hi"}');
  });

  it('G5: a failed unpublish leaves the draft state untouched and shows an inline error', async () => {
    const api = installFakeEditorApi({
      content: '{"title":"Hi"}',
      etag: '"etag-1"',
      source: 'live',
      forceActionFailure: true,
    });
    vi.spyOn(window, 'prompt').mockReturnValue('Taking this offline');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Content')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(screen.getByText('Could not reach the site')).toBeDefined());
    expect(api.state.source).toBe('live');
    expect((screen.getByLabelText('Content') as HTMLTextAreaElement).value).toBe('{"title":"Hi"}');
  });
});
