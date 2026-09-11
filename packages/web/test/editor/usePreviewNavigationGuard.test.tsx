import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { usePreviewNavigationGuard } from '../../src/editor/usePreviewNavigationGuard.tsx';
import { PreviewProvider, usePreview } from '../../src/layout/PreviewContext.tsx';
import { createFakeStorage } from '../helpers/fakeStorage.ts';

const SITE_ID = 'site-1';
const CURRENT_PATH = 'pages/index.json';
const CURRENT_URL = '/';
const TARGET = { path: 'pages/projects.json', url: '/projects' };

function seedLastEditorLocation(): void {
  localStorage.setItem(
    'cms-admin-last-editor-location',
    JSON.stringify({ [SITE_ID]: `/sites/${SITE_ID}/editor?path=${encodeURIComponent(CURRENT_PATH)}&url=${encodeURIComponent(CURRENT_URL)}` }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return <PreviewProvider siteId={SITE_ID}>{children}</PreviewProvider>;
}

// A second hook instance in the same tree, reading the same context, so
// tests can assert on the actual previewUrl a real consumer would see
// after a switch - not just that some internal state changed.
function renderGuard() {
  return renderHook(
    () => {
      const guard = usePreviewNavigationGuard(SITE_ID);
      const { previewUrl } = usePreview();
      return { ...guard, previewUrl };
    },
    { wrapper },
  );
}

function installFakeFetch(handlers: {
  content?: Response | (() => Response);
  publish?: Response | (() => Response);
  discard?: Response | (() => Response);
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('/content/')) {
      const handler = handlers.content;
      if (!handler) {
        throw new Error('unexpected content read in test');
      }
      return typeof handler === 'function' ? handler() : handler;
    }
    if (method === 'POST' && url.endsWith('/publish')) {
      const handler = handlers.publish;
      if (!handler) {
        throw new Error('unexpected publish call');
      }
      return typeof handler === 'function' ? handler() : handler;
    }
    if (method === 'DELETE' && url.includes('/drafts/')) {
      const handler = handlers.discard;
      if (!handler) {
        throw new Error('unexpected discard call');
      }
      return typeof handler === 'function' ? handler() : handler;
    }

    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function liveContentResponse(): Response {
  return new Response('{}', { status: 200, headers: { etag: '"1"', 'x-content-source': 'live' } });
}

function draftContentResponse(): Response {
  return new Response('{}', { status: 200, headers: { etag: '"1"', 'x-content-source': 'draft' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePreviewNavigationGuard', () => {
  it('switches immediately when the current page has no draft (source: live), no prompt shown', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    installFakeFetch({ content: liveContentResponse() });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));

    await waitFor(() => expect(result.current.previewUrl).toBe(TARGET.url));
    expect(result.current.promptElement).toBeNull();
  });

  it('switches immediately with no read at all when nothing was previously previewed', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    const fetchMock = installFakeFetch({});
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));

    await waitFor(() => expect(result.current.previewUrl).toBe(TARGET.url));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('switches immediately, no read, when the target is the page already being shown', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    const fetchMock = installFakeFetch({});
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch({ path: CURRENT_PATH, url: CURRENT_URL }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.promptElement).toBeNull();
  });

  it('shows the prompt instead of switching when the current page has an unpublished draft', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    installFakeFetch({ content: draftContentResponse() });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));

    await waitFor(() => expect(result.current.promptElement).not.toBeNull());
    expect(result.current.previewUrl).not.toBe(TARGET.url);
  });

  it('Save publishes the current page then completes the switch', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    const fetchMock = installFakeFetch({
      content: draftContentResponse(),
      publish: new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));
    await waitFor(() => expect(result.current.promptElement).not.toBeNull());

    // promptElement is a real <UnsavedChangesPrompt onSave={...} .../>
    // element - calling its own onSave prop directly exercises the
    // exact same handler a real click would, without needing to render
    // and click through the DOM.
    await act(async () => {
      const prompt = result.current.promptElement as { props: { onSave: () => void } };
      prompt.props.onSave();
    });

    await waitFor(() => expect(result.current.previewUrl).toBe(TARGET.url));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/publish'), expect.objectContaining({ method: 'POST' }));
    expect(result.current.promptElement).toBeNull();
  });

  it('Discard discards the current page\'s draft then completes the switch', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    const fetchMock = installFakeFetch({
      content: draftContentResponse(),
      discard: new Response(null, { status: 204 }),
    });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));
    await waitFor(() => expect(result.current.promptElement).not.toBeNull());

    await act(async () => {
      const prompt = result.current.promptElement as { props: { onDiscard: () => void } };
      prompt.props.onDiscard();
    });

    await waitFor(() => expect(result.current.previewUrl).toBe(TARGET.url));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/drafts/'), expect.objectContaining({ method: 'DELETE' }));
    expect(result.current.promptElement).toBeNull();
  });

  it('Cancel leaves the current page showing, no switch', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    installFakeFetch({ content: draftContentResponse() });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));
    await waitFor(() => expect(result.current.promptElement).not.toBeNull());

    act(() => {
      const prompt = result.current.promptElement as { props: { onCancel: () => void } };
      prompt.props.onCancel();
    });

    expect(result.current.promptElement).toBeNull();
    expect(result.current.previewUrl).not.toBe(TARGET.url);
  });

  it('fails open (switches immediately) if the current page cannot be read at all', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    installFakeFetch({ content: new Response(JSON.stringify({ error: 'gone' }), { status: 404 }) });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));

    await waitFor(() => expect(result.current.previewUrl).toBe(TARGET.url));
    expect(result.current.promptElement).toBeNull();
  });
});
