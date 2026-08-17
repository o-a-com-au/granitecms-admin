import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { RequireDeveloper } from '../../src/auth/RequireDeveloper.tsx';

function renderGuarded(initialEntries: string[]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route element={<RequireDeveloper />}>
            <Route path="/settings" element={<div>developer-only settings</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function stubUser(user: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(user), { status: 200 })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequireDeveloper', () => {
  it('renders the protected content for a developer', async () => {
    stubUser({ id: 'dev-1', username: 'dev-1', role: 'developer', status: 'active' });

    renderGuarded(['/settings']);

    await waitFor(() => expect(screen.getByText('developer-only settings')).toBeDefined());
  });

  it('redirects a client to / rather than showing the developer-only page', async () => {
    stubUser({ id: 'client-1', username: 'client-1', role: 'client', status: 'active' });

    renderGuarded(['/settings']);

    await waitFor(() => expect(screen.getByText('home')).toBeDefined());
    expect(screen.queryByText('developer-only settings')).toBeNull();
  });

  it('renders nothing while the auth status is still loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    renderGuarded(['/settings']);

    expect(screen.queryByText('home')).toBeNull();
    expect(screen.queryByText('developer-only settings')).toBeNull();
  });
});
