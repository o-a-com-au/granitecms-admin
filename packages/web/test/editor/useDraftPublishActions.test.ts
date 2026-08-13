import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDraftPublishActions } from '../../src/editor/useDraftPublishActions.ts';

function installFakeFetch(handlers: { publish?: Response | (() => Response); discard?: Response | (() => Response) }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

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

afterEach(() => {
  vi.unstubAllGlobals();
  // vi.spyOn(window, 'confirm') elsewhere in this file returns the
  // SAME accumulated mock (with its prior call history) on every
  // repeat call within a file unless explicitly restored.
  vi.restoreAllMocks();
});

describe('useDraftPublishActions', () => {
  it('publishing sends an auto-generated message built from the given label, then reloadLatest on success', async () => {
    const fetchMock = installFakeFetch({ publish: new Response(JSON.stringify({ ok: true }), { status: 200 }) });
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', 'Main Menu', reloadLatest));

    await act(() => result.current.handlePublish());

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(init.body as string) as { message: string };
    expect(body.message.startsWith('Main Menu - ')).toBe(true);
    expect(reloadLatest).toHaveBeenCalledOnce();
    expect(result.current.actionError).toBeNull();
  });

  it('a failed publish surfaces the error and does not reload', async () => {
    installFakeFetch({
      publish: new Response(JSON.stringify({ error: 'Could not reach the site' }), { status: 502 }),
    });
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', 'Main Menu', reloadLatest));

    await act(() => result.current.handlePublish());

    await waitFor(() => expect(result.current.actionError).toBe('Could not reach the site'));
    expect(reloadLatest).not.toHaveBeenCalled();
  });

  it('discard is confirmed first; declining makes no call and does not reload', async () => {
    const fetchMock = installFakeFetch({});
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', 'Main Menu', reloadLatest));

    await act(() => result.current.handleDiscard());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reloadLatest).not.toHaveBeenCalled();
  });

  it('confirming discard calls discard, then reloadLatest on success', async () => {
    installFakeFetch({ discard: new Response(null, { status: 204 }) });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', 'Main Menu', reloadLatest));

    await act(() => result.current.handleDiscard());

    expect(reloadLatest).toHaveBeenCalledOnce();
  });

  // The blocked-navigation flow (PageEditorPage/MenuEditorPage) needs
  // to know synchronously whether Save/Discard actually went through,
  // to decide whether to let the pending navigation proceed.
  it('handlePublish resolves true on success and false on failure', async () => {
    const fetchMock = installFakeFetch({ publish: new Response(JSON.stringify({ ok: true }), { status: 200 }) });
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', 'Main Menu', vi.fn()));
    await expect(act(() => result.current.handlePublish())).resolves.toBe(true);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), { status: 502 }));
    await expect(act(() => result.current.handlePublish())).resolves.toBe(false);
  });

  // skipConfirm - the blocked-navigation flow's own modal IS the
  // confirmation there; without this, discard-from-that-flow would
  // always show a second, redundant native confirm on top of it.
  it('handleDiscard({ skipConfirm: true }) calls discard directly, with no window.confirm at all', async () => {
    installFakeFetch({ discard: new Response(null, { status: 204 }) });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', 'Main Menu', reloadLatest));

    const ok = await act(() => result.current.handleDiscard({ skipConfirm: true }));

    expect(ok).toBe(true);
    expect(reloadLatest).toHaveBeenCalledOnce();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
