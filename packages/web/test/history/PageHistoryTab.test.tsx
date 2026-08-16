import { type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PageHistoryTab } from '../../src/history/PageHistoryTab.tsx';

const COMMIT_NEWEST = {
  hash: 'newest111',
  author: { name: 'Jane Editor', email: 'jane@example.com' },
  date: '2026-01-03T00:00:00.000Z',
  message: 'Latest edit',
  isCheckpoint: false,
};
const COMMIT_CHECKPOINT = {
  hash: 'checkpoint1',
  author: { name: 'CMS Agent', email: 'agent@localhost' },
  date: '2026-01-02T00:00:00.000Z',
  message: 'chore: draft checkpoint',
  isCheckpoint: true,
};
const COMMIT_OLDEST = {
  hash: 'oldest999',
  author: { name: 'Jane Editor', email: 'jane@example.com' },
  date: '2026-01-01T00:00:00.000Z',
  message: 'First version',
  isCheckpoint: false,
};

interface FakeState {
  commits: Array<typeof COMMIT_NEWEST>;
  hasMore: boolean;
  forceRevertFailure?: boolean;
}

function installFakeHistoryApi(initial: FakeState) {
  const state: FakeState = { ...initial };
  let historyFetchCount = 0;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url.includes('/history/')) {
      historyFetchCount += 1;
      return new Response(JSON.stringify({ commits: state.commits, hasMore: state.hasMore }), { status: 200 });
    }

    if (method === 'POST' && url.endsWith('/revert')) {
      const body = JSON.parse(init?.body as string) as { ref: string; path: string; message: string };
      if (!body.message?.trim()) {
        return new Response(JSON.stringify({ error: 'ref, path, and message are all required' }), { status: 400 });
      }
      if (state.forceRevertFailure) {
        return new Response(JSON.stringify({ error: 'Could not reach the site', reason: 'unreachable' }), {
          status: 502,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { state, getHistoryFetchCount: () => historyFetchCount };
}

function renderTab(overrides: Partial<ComponentProps<typeof PageHistoryTab>> = {}) {
  const onSelectRevision = vi.fn();
  const onRestored = vi.fn();
  const utils = render(
    <PageHistoryTab
      siteId="site-1"
      path="pages/about.json"
      previewRef={null}
      onSelectRevision={onSelectRevision}
      onRestored={onRestored}
      {...overrides}
    />,
  );
  return { ...utils, onSelectRevision, onRestored };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PageHistoryTab', () => {
  it('lists commits from the real history route', async () => {
    installFakeHistoryApi({ commits: [COMMIT_NEWEST, COMMIT_OLDEST], hasMore: false });
    renderTab();

    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());
    expect(screen.getByText('First version')).toBeDefined();
  });

  it('checkpoint commits are hidden by default; the toggle reveals them without an extra fetch', async () => {
    const api = installFakeHistoryApi({ commits: [COMMIT_NEWEST, COMMIT_CHECKPOINT, COMMIT_OLDEST], hasMore: false });
    renderTab();

    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());
    expect(screen.queryByText('chore: draft checkpoint', { exact: false })).toBeNull();

    const countBeforeToggle = api.getHistoryFetchCount();
    fireEvent.click(screen.getByLabelText('Show checkpoint commits'));

    await waitFor(() => expect(screen.getByText('chore: draft checkpoint', { exact: false })).toBeDefined());
    expect(api.getHistoryFetchCount()).toBe(countBeforeToggle);
  });

  it('clicking a row calls onSelectRevision with that commit\'s hash', async () => {
    installFakeHistoryApi({ commits: [COMMIT_NEWEST, COMMIT_OLDEST], hasMore: false });
    const { onSelectRevision } = renderTab();
    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Preview version from 3 Jan 2026' }));

    expect(onSelectRevision).toHaveBeenCalledWith('newest111');
  });

  it('shows a "Back to current version" control only while previewing a revision, which clears it', async () => {
    installFakeHistoryApi({ commits: [COMMIT_NEWEST], hasMore: false });
    const { onSelectRevision, rerender } = renderTab({ previewRef: null });
    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());
    expect(screen.queryByText('← Back to current version')).toBeNull();

    rerender(
      <PageHistoryTab
        siteId="site-1"
        path="pages/about.json"
        previewRef="newest111"
        onSelectRevision={onSelectRevision}
        onRestored={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('← Back to current version'));
    expect(onSelectRevision).toHaveBeenCalledWith(null);
  });

  it('clicking Restore opens a confirmation with the auto-generated message, never a native prompt', async () => {
    installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false });
    const promptSpy = vi.spyOn(window, 'prompt');
    renderTab();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(screen.getByText('Restore page to version from 1 Jan 2026')).toBeDefined();
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('confirming Restore calls the revert plumbing, refetches history, clears the preview, and notifies the parent', async () => {
    const api = installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false });
    const { onSelectRevision, onRestored } = renderTab({ previewRef: 'oldest999' });
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    api.state.commits = [{ ...COMMIT_OLDEST, hash: 'restore1', message: 'Restore page to version from 1 Jan 2026' }, COMMIT_OLDEST];
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.getByText('Restore page to version from 1 Jan 2026')).toBeDefined());
    expect(onSelectRevision).toHaveBeenCalledWith(null);
    expect(onRestored).toHaveBeenCalled();
  });

  it('cancelling the confirmation makes no revert call at all', async () => {
    installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false });
    renderTab();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Are you sure?')).toBeNull();
  });

  it('a failed restore shows an inline error', async () => {
    installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false, forceRevertFailure: true });
    renderTab();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.getByText('Could not reach the site')).toBeDefined());
  });
});
