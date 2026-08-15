import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { HistoryPage } from '../../src/pages/HistoryPage.tsx';

function installFakeApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ commits: [], hasMore: false }), { status: 200 })),
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sites/:siteId/history" element={<HistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HistoryPage', () => {
  it('renders the site-wide SiteHistoryPage when ?path= is absent (the top-nav destination)', async () => {
    installFakeApi();
    renderAt('/sites/site-1/history');

    await waitFor(() => expect(screen.getByText('No commits to show.')).toBeDefined());
    // SiteHistoryPage-only affordance.
    expect(screen.queryByText(/^Site: /)).toBeNull();
  });

  it('renders the page-scoped PageHistoryPage when ?path= is present, even if empty', async () => {
    installFakeApi();
    renderAt('/sites/site-1/history?path=');

    await waitFor(() => expect(screen.getByText(/^Site: /)).toBeDefined());
  });

  it('renders PageHistoryPage for a real path too', async () => {
    installFakeApi();
    renderAt('/sites/site-1/history?path=pages%2Fabout.json');

    await waitFor(() => expect(screen.getByText(/^Site: /)).toBeDefined());
    expect(screen.getByText('pages/about.json')).toBeDefined();
  });
});
