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
});

describe('useDraftPublishActions', () => {
  it('publishing prompts for a message, calls publish, then reloadLatest on success', async () => {
    installFakeFetch({ publish: new Response(JSON.stringify({ ok: true }), { status: 200 }) });
    vi.spyOn(window, 'prompt').mockReturnValue('Ship it');
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', reloadLatest));

    await act(() => result.current.handlePublish());

    expect(reloadLatest).toHaveBeenCalledOnce();
    expect(result.current.actionError).toBeNull();
  });

  it('cancelling the publish prompt makes no call and does not reload', async () => {
    const fetchMock = installFakeFetch({});
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', reloadLatest));

    await act(() => result.current.handlePublish());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reloadLatest).not.toHaveBeenCalled();
  });

  it('a blank publish message is rejected client-side with an inline error, no call made', async () => {
    const fetchMock = installFakeFetch({});
    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', vi.fn()));

    await act(() => result.current.handlePublish());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.actionError).toBe('A commit message is required to publish.');
  });

  it('a failed publish surfaces the error and does not reload', async () => {
    installFakeFetch({
      publish: new Response(JSON.stringify({ error: 'Could not reach the site' }), { status: 502 }),
    });
    vi.spyOn(window, 'prompt').mockReturnValue('Ship it');
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', reloadLatest));

    await act(() => result.current.handlePublish());

    await waitFor(() => expect(result.current.actionError).toBe('Could not reach the site'));
    expect(reloadLatest).not.toHaveBeenCalled();
  });

  it('discard is confirmed first; declining makes no call and does not reload', async () => {
    const fetchMock = installFakeFetch({});
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', reloadLatest));

    await act(() => result.current.handleDiscard());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reloadLatest).not.toHaveBeenCalled();
  });

  it('confirming discard calls discard, then reloadLatest on success', async () => {
    installFakeFetch({ discard: new Response(null, { status: 204 }) });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reloadLatest = vi.fn();
    const { result } = renderHook(() => useDraftPublishActions('site-1', 'menus/main.json', reloadLatest));

    await act(() => result.current.handleDiscard());

    expect(reloadLatest).toHaveBeenCalledOnce();
  });
});
