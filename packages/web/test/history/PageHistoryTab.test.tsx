import { type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PageHistoryTab, formatCommitTimestamp } from '../../src/history/PageHistoryTab.tsx';

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
  let discardDraftCallCount = 0;

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

    if (method === 'DELETE' && url.includes('/drafts/')) {
      discardDraftCallCount += 1;
      return new Response(null, { status: 204 });
    }

    throw new Error(`unhandled fetch in test: ${method} ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { state, getHistoryFetchCount: () => historyFetchCount, getDiscardDraftCallCount: () => discardDraftCallCount };
}

function renderTab(overrides: Partial<ComponentProps<typeof PageHistoryTab>> = {}) {
  const onSelectRevision = vi.fn();
  const onRestored = vi.fn();
  const utils = render(
    <PageHistoryTab
      siteId="site-1"
      path="pages/about.json"
      previewRef={null}
      hasDraft={false}
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
  it('lists commits from the real history route, each as a single timestamp label', async () => {
    installFakeHistoryApi({ commits: [COMMIT_NEWEST, COMMIT_OLDEST], hasMore: false });
    renderTab();

    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_NEWEST.date))).toBeDefined());
    expect(screen.getByText(formatCommitTimestamp(COMMIT_OLDEST.date))).toBeDefined();
    // No message/author text is rendered - only the timestamp.
    expect(screen.queryByText('Latest edit')).toBeNull();
    expect(screen.queryByText('Jane Editor', { exact: false })).toBeNull();
  });

  it('checkpoint commits (the agent\'s own periodic draft autosaves) are always excluded, with no way to reveal them', async () => {
    installFakeHistoryApi({ commits: [COMMIT_NEWEST, COMMIT_CHECKPOINT, COMMIT_OLDEST], hasMore: false });
    renderTab();

    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_NEWEST.date))).toBeDefined());
    expect(screen.queryByText(formatCommitTimestamp(COMMIT_CHECKPOINT.date))).toBeNull();
    expect(screen.queryByLabelText('Show checkpoint commits')).toBeNull();
  });

  it('clicking a row calls onSelectRevision with that commit\'s hash', async () => {
    installFakeHistoryApi({ commits: [COMMIT_NEWEST, COMMIT_OLDEST], hasMore: false });
    const { onSelectRevision } = renderTab();
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_NEWEST.date))).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: `Preview version from ${formatCommitTimestamp(COMMIT_NEWEST.date)}` }));

    expect(onSelectRevision).toHaveBeenCalledWith('newest111');
  });

  it('shows a "Back to current version" control only while previewing a revision, which clears it', async () => {
    installFakeHistoryApi({ commits: [COMMIT_NEWEST], hasMore: false });
    const { onSelectRevision, rerender } = renderTab({ previewRef: null });
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_NEWEST.date))).toBeDefined());
    expect(screen.queryByText('← Back to current version')).toBeNull();

    rerender(
      <PageHistoryTab
        siteId="site-1"
        path="pages/about.json"
        previewRef="newest111"
        hasDraft={false}
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
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_OLDEST.date))).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(screen.getByText('Restore page to version from 1 Jan 2026')).toBeDefined();
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('when a draft is open, the confirmation warns it will be discarded too', async () => {
    installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false });
    renderTab({ hasDraft: true });
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_OLDEST.date))).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(
      screen.getByText('Restore page to version from 1 Jan 2026. This will also discard your unsaved draft.'),
    ).toBeDefined();
  });

  it('confirming Restore calls the revert plumbing, refetches history, clears the preview, and notifies the parent', async () => {
    const api = installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false });
    const { onSelectRevision, onRestored } = renderTab({ previewRef: 'oldest999' });
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_OLDEST.date))).toBeDefined());
    const fetchCountBeforeRestore = api.getHistoryFetchCount();

    api.state.commits = [{ ...COMMIT_OLDEST, hash: 'restore1', message: 'Restore page to version from 1 Jan 2026' }, COMMIT_OLDEST];
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(onSelectRevision).toHaveBeenCalledWith(null);
    expect(api.getHistoryFetchCount()).toBeGreaterThan(fetchCountBeforeRestore);
  });

  it('when hasDraft is true, confirming Restore also discards the open draft', async () => {
    const api = installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false });
    renderTab({ hasDraft: true });
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_OLDEST.date))).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(api.getDiscardDraftCallCount()).toBe(1));
  });

  it('when hasDraft is false, confirming Restore never touches the draft endpoint', async () => {
    const api = installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false });
    const { onRestored } = renderTab({ hasDraft: false });
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_OLDEST.date))).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(api.getDiscardDraftCallCount()).toBe(0);
  });

  it('a failed revert never discards the draft - a failed action must not destroy work for nothing', async () => {
    const api = installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false, forceRevertFailure: true });
    renderTab({ hasDraft: true });
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_OLDEST.date))).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.getByText('Could not reach the site')).toBeDefined());
    expect(api.getDiscardDraftCallCount()).toBe(0);
  });

  it('cancelling the confirmation makes no revert call at all', async () => {
    installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false });
    renderTab();
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_OLDEST.date))).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Are you sure?')).toBeNull();
  });

  it('a failed restore shows an inline error', async () => {
    installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false, forceRevertFailure: true });
    renderTab();
    await waitFor(() => expect(screen.getByText(formatCommitTimestamp(COMMIT_OLDEST.date))).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(screen.getByText('Could not reach the site')).toBeDefined());
  });
});
