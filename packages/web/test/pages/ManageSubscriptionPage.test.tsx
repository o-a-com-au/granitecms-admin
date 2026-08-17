import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { ManageSubscriptionPage } from '../../src/pages/ManageSubscriptionPage.tsx';

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <ManageSubscriptionPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

// /pause is wired to a mutable currentStatus so the confirm test can
// observe the page's own refresh() call actually pick up the new
// value - the same shape AppShell.test.tsx used before this moved.
function installFakeApiWithPauseSupport() {
  let currentStatus: 'active' | 'paused' = 'active';
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/auth/me') {
      return new Response(
        JSON.stringify({
          id: 'jane',
          username: 'jane',
          name: 'Jane Editor',
          email: 'jane@example.com',
          role: 'developer',
          status: currentStatus,
        }),
        { status: 200 },
      );
    }
    if (url === '/api/auth/pause' && init?.method === 'POST') {
      currentStatus = 'paused';
      return new Response(JSON.stringify({ status: 'paused' }), { status: 200 });
    }
    throw new Error(`unhandled fetch in test: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ManageSubscriptionPage', () => {
  it('shows the placeholder Plan section', async () => {
    installFakeApiWithPauseSupport();
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Plan' })).toBeDefined());
    expect(screen.getByText('Plan and billing management is coming soon.')).toBeDefined();
  });

  it('"Pause subscription" asks for confirmation before pausing', async () => {
    installFakeApiWithPauseSupport();
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Manage Subscription' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Pause subscription' }));

    expect(screen.getByRole('alertdialog')).toBeDefined();
  });

  it('cancelling the pause confirmation makes no API call and closes the dialog', async () => {
    const fetchMock = installFakeApiWithPauseSupport();
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Manage Subscription' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Pause subscription' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/pause', { method: 'POST' });
  });

  it('confirming the pause calls POST /api/auth/pause and re-fetches /me', async () => {
    const fetchMock = installFakeApiWithPauseSupport();
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Manage Subscription' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Pause subscription' }));
    // Both the trigger and the dialog's confirm button share this
    // label - the dialog's is the one still in the DOM after the
    // trigger's own click already happened, and getByRole across both
    // would be ambiguous, so scope to the dialog.
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Pause subscription' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/pause', { method: 'POST' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    // Two /me calls: the initial mount fetch, and the post-pause refresh().
    const meCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      return url === '/api/auth/me';
    });
    expect(meCalls.length).toBeGreaterThanOrEqual(2);
  });
});
