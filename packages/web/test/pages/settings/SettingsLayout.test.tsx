import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../../src/auth/AuthContext.tsx';
import { SettingsLayout } from '../../../src/pages/settings/SettingsLayout.tsx';

function installFakeMe(role: 'developer' | 'client') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(
          JSON.stringify({
            id: 'jane',
            username: 'jane',
            firstName: 'Jane',
            lastName: 'Editor',
            email: 'jane@example.com',
            role,
            status: 'active',
          }),
          { status: 200 },
        );
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    }),
  );
}

function renderLayout(initialPath: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/settings" element={<SettingsLayout />}>
            <Route path="personal" element={<div>personal pane</div>} />
            <Route path="password" element={<div>password pane</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsLayout', () => {
  it('a developer sees all four sidebar sections, including Manage Sites', async () => {
    installFakeMe('developer');
    renderLayout('/settings/personal');

    await waitFor(() => expect(screen.getByRole('link', { name: 'Personal Details' })).toBeDefined());
    expect(screen.getByRole('link', { name: 'Password and Security' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Manage Subscription' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Manage Sites' })).toBeDefined();
  });

  it('a client does not see Manage Sites', async () => {
    installFakeMe('client');
    renderLayout('/settings/personal');

    await waitFor(() => expect(screen.getByRole('link', { name: 'Personal Details' })).toBeDefined());
    expect(screen.queryByRole('link', { name: 'Manage Sites' })).toBeNull();
  });

  it('marks the link matching the current section as the active page', async () => {
    installFakeMe('developer');
    renderLayout('/settings/password');

    await waitFor(() => expect(screen.getByText('password pane')).toBeDefined());
    expect(screen.getByRole('link', { name: 'Password and Security' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Personal Details' }).getAttribute('aria-current')).toBeNull();
  });

  it("renders the section's content in the outlet", async () => {
    installFakeMe('developer');
    renderLayout('/settings/personal');

    await waitFor(() => expect(screen.getByText('personal pane')).toBeDefined());
  });
});
