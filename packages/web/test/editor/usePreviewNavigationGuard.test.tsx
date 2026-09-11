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
    installFakeFetch({ content: () => liveContentResponse() });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));

    await waitFor(() => expect(result.current.previewUrl).toBe(TARGET.url));
    expect(result.current.promptElement).toBeNull();
  });

  it('switches immediately with no draft-vs-navigate check at all when nothing was previously previewed', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    // Only needed for the hasDraft-tracking effect's own post-switch
    // check of the newly-shown page (for the header action bar) - the
    // switch decision itself has nothing to check against yet.
    const fetchMock = installFakeFetch({ content: () => liveContentResponse() });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));

    await waitFor(() => expect(result.current.previewUrl).toBe(TARGET.url));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(TARGET.path));
  });

  it('switches immediately, no extra read, when the target is the page already being shown', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    // hasDraft-tracking runs once on mount regardless (to seed the
    // header action bar for whatever's already showing) - what this
    // test actually checks is that requestPreviewSwitch's own
    // same-page short-circuit doesn't trigger a SECOND one.
    const fetchMock = installFakeFetch({ content: () => liveContentResponse() });
    const { result } = renderGuard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => result.current.requestPreviewSwitch({ path: CURRENT_PATH, url: CURRENT_URL }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.promptElement).toBeNull();
  });

  it('shows the prompt instead of switching when the current page has an unpublished draft', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    installFakeFetch({ content: () => draftContentResponse() });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));

    await waitFor(() => expect(result.current.promptElement).not.toBeNull());
    expect(result.current.previewUrl).not.toBe(TARGET.url);
  });

  it('Save publishes the current page then completes the switch', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    const fetchMock = installFakeFetch({
      content: () => draftContentResponse(),
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
      content: () => draftContentResponse(),
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
    installFakeFetch({ content: () => draftContentResponse() });
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
    installFakeFetch({ content: () => new Response(JSON.stringify({ error: 'gone' }), { status: 404 }) });
    const { result } = renderGuard();

    act(() => result.current.requestPreviewSwitch(TARGET));

    await waitFor(() => expect(result.current.previewUrl).toBe(TARGET.url));
    expect(result.current.promptElement).toBeNull();
  });

  // hasDraft/publishCurrent/discardCurrent - the persistent header
  // action bar (Media/Pages hub's own DraftActionButtons), shown the
  // whole time the current page has a draft, not just at the point of
  // leaving.
  it('hasDraft reflects the currently shown page, tracked on mount', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    installFakeFetch({ content: () => draftContentResponse() });
    const { result } = renderGuard();

    await waitFor(() => expect(result.current.hasDraft).toBe(true));
  });

  it('publishCurrent publishes the current page, then the re-check (bumpPreview) picks up it is live and clears hasDraft', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    // Stateful, not a fixed response - hasDraft is deliberately never
    // set optimistically on publish success, only by the real
    // re-check bumpPreview triggers, so the mock has to actually
    // reflect the server-side effect of that publish to prove it.
    let published = false;
    const fetchMock = installFakeFetch({
      content: () => (published ? liveContentResponse() : draftContentResponse()),
      publish: () => {
        published = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });
    const { result } = renderGuard();
    await waitFor(() => expect(result.current.hasDraft).toBe(true));

    await act(async () => result.current.publishCurrent());

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/publish'), expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(result.current.hasDraft).toBe(false));
    expect(result.current.previewUrl).toBe(CURRENT_URL);
  });

  it('discardCurrent discards the current page\'s draft, then the re-check (bumpPreview) picks up it is live and clears hasDraft', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    seedLastEditorLocation();
    let discarded = false;
    const fetchMock = installFakeFetch({
      content: () => (discarded ? liveContentResponse() : draftContentResponse()),
      discard: () => {
        discarded = true;
        return new Response(null, { status: 204 });
      },
    });
    const { result } = renderGuard();
    await waitFor(() => expect(result.current.hasDraft).toBe(true));

    await act(async () => result.current.discardCurrent());

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/drafts/'), expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(result.current.hasDraft).toBe(false));
    expect(result.current.previewUrl).toBe(CURRENT_URL);
  });
});
