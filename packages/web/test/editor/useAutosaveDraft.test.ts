import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAutosaveDraft } from '../../src/editor/useAutosaveDraft.ts';

// Real timers with a tiny injected debounce, not fake timers - mixing
// vitest's fake timers with RTL's waitFor deadlocks (waitFor polls via
// the very timer mechanism that's frozen), confirmed empirically while
// writing this file, not assumed. A 20ms real debounce keeps these
// tests fast without fighting that interaction.
const TEST_DEBOUNCE_MS = 20;

interface FakeState {
  content: string;
  etag: string;
  source: 'draft' | 'live';
}

function installFakeEditorApi(initial: FakeState) {
  const state: FakeState = { ...initial };
  let etagCounter = 1;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('/content/')) {
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
  return { state, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAutosaveDraft', () => {
  it('E1: loads the current content, source, and etag on mount', async () => {
    installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });

    const { result } = renderHook(() => useAutosaveDraft('site-1', 'pages/about.json', TEST_DEBOUNCE_MS));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.content).toBe('{"title":"Hi"}');
    expect(result.current.source).toBe('draft');
  });

  it('E2: editing and pausing triggers an autosave with no explicit save action', async () => {
    const api = installFakeEditorApi({ content: '{"title":"Hi"}', etag: '"etag-1"', source: 'draft' });
    const { result } = renderHook(() => useAutosaveDraft('site-1', 'pages/about.json', TEST_DEBOUNCE_MS));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.setContent('{"title":"Edited"}'));
    expect(result.current.status).toBe('dirty');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.state.content).toBe('{"title":"Edited"}');
  });

  it('E3: the held etag updates from the save response, so the next save uses it', async () => {
    const api = installFakeEditorApi({ content: '{"a":1}', etag: '"etag-1"', source: 'draft' });
    const { result } = renderHook(() => useAutosaveDraft('site-1', 'pages/about.json', TEST_DEBOUNCE_MS));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.setContent('{"a":2}'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(api.state.etag).not.toBe('"etag-1"');

    act(() => result.current.setContent('{"a":3}'));
    await waitFor(() => expect(api.state.content).toBe('{"a":3}'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('chained save: typing again while a save is in flight queues a follow-up with the fresh etag', async () => {
    const api = installFakeEditorApi({ content: '{"a":1}', etag: '"etag-1"', source: 'draft' });
    const { result } = renderHook(() => useAutosaveDraft('site-1', 'pages/about.json', TEST_DEBOUNCE_MS));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.setContent('{"a":2}'));
    act(() => result.current.setContent('{"a":3}'));

    await waitFor(() => expect(api.state.content).toBe('{"a":3}'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('E4: a 409 enters the conflict state without touching local content', async () => {
    const api = installFakeEditorApi({ content: '{"a":1}', etag: '"etag-1"', source: 'draft' });
    const { result } = renderHook(() => useAutosaveDraft('site-1', 'pages/about.json', TEST_DEBOUNCE_MS));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Someone else's save lands first, changing the real etag.
    api.state.etag = '"etag-99"';
    api.state.content = '{"a":"someone-else"}';

    act(() => result.current.setContent('{"a":"mine"}'));

    await waitFor(() => expect(result.current.status).toBe('conflict'));
    expect(result.current.content).toBe('{"a":"mine"}');
  });

  it('E5: reloadLatest discards local content and re-fetches', async () => {
    const api = installFakeEditorApi({ content: '{"a":1}', etag: '"etag-1"', source: 'draft' });
    const { result } = renderHook(() => useAutosaveDraft('site-1', 'pages/about.json', TEST_DEBOUNCE_MS));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    api.state.etag = '"etag-99"';
    api.state.content = '{"a":"latest"}';
    act(() => result.current.setContent('{"a":"mine"}'));
    await waitFor(() => expect(result.current.status).toBe('conflict'));

    act(() => result.current.reloadLatest());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.content).toBe('{"a":"latest"}');
  });

  it('E5: loadComparison fetches the latest without touching authoritative state', async () => {
    const api = installFakeEditorApi({ content: '{"a":1}', etag: '"etag-1"', source: 'draft' });
    const { result } = renderHook(() => useAutosaveDraft('site-1', 'pages/about.json', TEST_DEBOUNCE_MS));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    api.state.etag = '"etag-99"';
    api.state.content = '{"a":"latest"}';
    act(() => result.current.setContent('{"a":"mine"}'));
    await waitFor(() => expect(result.current.status).toBe('conflict'));

    act(() => result.current.loadComparison());
    await waitFor(() => expect(result.current.comparisonContent).toBe('{"a":"latest"}'));

    // Viewing must not silently resolve the conflict.
    expect(result.current.status).toBe('conflict');
    expect(result.current.content).toBe('{"a":"mine"}');
  });

  it('malformed JSON is held, not saved', async () => {
    const api = installFakeEditorApi({ content: '{"a":1}', etag: '"etag-1"', source: 'draft' });
    const { result } = renderHook(() => useAutosaveDraft('site-1', 'pages/about.json', TEST_DEBOUNCE_MS));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.setContent('{"a": not valid'));
    expect(result.current.invalidJson).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, TEST_DEBOUNCE_MS * 3));

    expect(api.state.content).toBe('{"a":1}');
  });
});
