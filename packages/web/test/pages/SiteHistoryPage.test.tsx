import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SiteHistoryPage } from '../../src/pages/SiteHistoryPage.tsx';

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

function installFakeHistoryApi(commits: Array<typeof COMMIT_NEWEST>, hasMore = false) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    expect(url).toMatch(/^\/api\/sites\/site-1\/history\?limit=\d+$/);
    return new Response(JSON.stringify({ commits, hasMore }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/sites/site-1/history']}>
      <Routes>
        <Route path="/sites/:siteId/history" element={<SiteHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SiteHistoryPage', () => {
  it('lists commits scoped to the site-wide (no-path) endpoint', async () => {
    installFakeHistoryApi([COMMIT_NEWEST]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());
    expect(screen.getByText('Jane Editor')).toBeDefined();
  });

  it('hides checkpoint commits by default, shows them when toggled', async () => {
    installFakeHistoryApi([COMMIT_NEWEST, COMMIT_CHECKPOINT]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());
    expect(screen.queryByText(/draft checkpoint/)).toBeNull();

    fireEvent.click(screen.getByLabelText('Show checkpoint commits'));

    expect(screen.getByText(/draft checkpoint/)).toBeDefined();
  });

  it('"Load older commits" increases the limit and refetches', async () => {
    const fetchMock = installFakeHistoryApi([COMMIT_NEWEST], true);
    renderPage();

    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());
    expect(screen.getByRole('button', { name: 'Load older commits' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Load older commits' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondCallUrl = fetchMock.mock.calls[1]?.[0]?.toString() ?? '';
    expect(secondCallUrl).toContain('limit=200');
  });

  it('shows a load error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Could not reach the site' }), { status: 502 })),
    );
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });

  it('no Compare/revert UI - this view is browse-only', async () => {
    installFakeHistoryApi([COMMIT_NEWEST]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Latest edit')).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Revert/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Select/ })).toBeNull();
  });
});
