import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PageHistoryPage } from '../../src/pages/PageHistoryPage.tsx';

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
  revisionContent: Record<string, string>;
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

    if (method === 'GET' && url.includes('/revision/')) {
      const ref = url.split('/revision/')[1]?.split('/')[0] ?? '';
      const content = state.revisionContent[ref];
      if (content === undefined) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      return new Response(content, { status: 200 });
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/sites/site-1/history?path=pages%2Fabout.json']}>
      <Routes>
        <Route path="/sites/:siteId/history" element={<PageHistoryPage />} />
        <Route path="/sites/:siteId/editor" element={<div>editor page</div>} />
        <Route path="/" element={<div>registry home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PageHistoryPage', () => {
  it('H1: lists commits from the real history route', async () => {
    installFakeHistoryApi({ commits: [COMMIT_NEWEST, COMMIT_OLDEST], hasMore: false, revisionContent: {} });
    renderPage();

    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());
    expect(screen.getByText('First version')).toBeDefined();
  });

  it('H2: checkpoint commits are hidden by default; the toggle reveals them without an extra fetch', async () => {
    const api = installFakeHistoryApi({
      commits: [COMMIT_NEWEST, COMMIT_CHECKPOINT, COMMIT_OLDEST],
      hasMore: false,
      revisionContent: {},
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());
    expect(screen.queryByText('chore: draft checkpoint', { exact: false })).toBeNull();

    const countBeforeToggle = api.getHistoryFetchCount();
    fireEvent.click(screen.getByLabelText('Show checkpoint commits'));

    await waitFor(() => expect(screen.getByText('chore: draft checkpoint', { exact: false })).toBeDefined());
    expect(api.getHistoryFetchCount()).toBe(countBeforeToggle);
  });

  it('H3: selecting one commit compares it against current (HEAD)', async () => {
    installFakeHistoryApi({
      commits: [COMMIT_NEWEST, COMMIT_OLDEST],
      hasMore: false,
      revisionContent: { HEAD: '{"title":"Current"}', oldest999: '{"title":"Old"}' },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    fireEvent.click(screen.getByLabelText('Select oldest9 for comparison'));
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));

    await waitFor(() => expect(screen.getByText('Current', { selector: 'code' })).toBeDefined());
    expect(screen.getByText('{"title":"Old"}', { exact: false })).toBeDefined();
  });

  it('H3: selecting two commits orders the diff older -> newer regardless of click order', async () => {
    installFakeHistoryApi({
      commits: [COMMIT_NEWEST, COMMIT_OLDEST],
      hasMore: false,
      revisionContent: { newest111: '{"title":"New"}', oldest999: '{"title":"Old"}' },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    // Click the NEWER one first, to prove order doesn't depend on click order.
    fireEvent.click(screen.getByLabelText('Select newest1 for comparison'));
    fireEvent.click(screen.getByLabelText('Select oldest9 for comparison'));
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));

    await waitFor(() => expect(screen.getByText('oldest9', { selector: 'code' })).toBeDefined());
    // "from" (left) is the older commit, "to" (right) is the newer one.
    const fromToText = screen.getByText(/Comparing/).textContent ?? '';
    expect(fromToText.indexOf('oldest9')).toBeLessThan(fromToText.indexOf('newest1'));
  });

  it('H3: a third checkbox click while two are already selected is a no-op', async () => {
    installFakeHistoryApi({
      commits: [COMMIT_NEWEST, COMMIT_CHECKPOINT, COMMIT_OLDEST],
      hasMore: false,
      revisionContent: {},
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Show checkpoint commits'));
    await waitFor(() => expect(screen.getByText('chore: draft checkpoint', { exact: false })).toBeDefined());

    fireEvent.click(screen.getByLabelText('Select newest1 for comparison'));
    fireEvent.click(screen.getByLabelText('Select oldest9 for comparison'));
    fireEvent.click(screen.getByLabelText('Select checkpo for comparison'));

    expect((screen.getByLabelText('Select checkpo for comparison') as HTMLInputElement).checked).toBe(false);
  });

  it('H4: revert is confirmed and prompted, then refetches history showing the new commit', async () => {
    const api = installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false, revisionContent: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('Revert to first version');
    renderPage();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    api.state.commits = [
      { ...COMMIT_OLDEST, hash: 'revert1', message: 'Revert to first version' },
      COMMIT_OLDEST,
    ];
    fireEvent.click(screen.getByRole('button', { name: 'Revert to this version' }));

    await waitFor(() => expect(screen.getByText('Revert to first version')).toBeDefined());
  });

  it('H4: declining the confirm makes no revert call at all', async () => {
    installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false, revisionContent: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const promptSpy = vi.spyOn(window, 'prompt');
    renderPage();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Revert to this version' }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('H4: a blank revert message is rejected client-side with no call', async () => {
    installFakeHistoryApi({ commits: [COMMIT_OLDEST], hasMore: false, revisionContent: {} });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('   ');
    renderPage();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Revert to this version' }));

    await waitFor(() => expect(screen.getByText('A commit message is required to revert.')).toBeDefined());
  });

  it('H4: a failed revert shows an inline error', async () => {
    installFakeHistoryApi({
      commits: [COMMIT_OLDEST],
      hasMore: false,
      revisionContent: {},
      forceRevertFailure: true,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('Revert to first version');
    renderPage();
    await waitFor(() => expect(screen.getByText('First version')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Revert to this version' }));

    await waitFor(() => expect(screen.getByText('Could not reach the site')).toBeDefined());
  });
});
