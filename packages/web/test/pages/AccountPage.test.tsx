import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { AccountPage } from '../../src/pages/AccountPage.tsx';

const CURRENT_USER = {
  id: 'jane',
  username: 'jane',
  name: 'Jane Editor',
  email: 'jane@example.com',
  role: 'developer',
  status: 'active',
};

function renderAccountPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountPage', () => {
  it('loads and displays the current name and email - no username field at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify(CURRENT_USER), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderAccountPage();

    await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Jane Editor'));
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('jane@example.com');
    expect(screen.queryByLabelText('Username')).toBeNull();
  });

  it('submitting details calls PATCH /me, refreshes the current user, and shows a confirmation', async () => {
    let currentName = CURRENT_USER.name;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me' && (init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify({ ...CURRENT_USER, name: currentName }), { status: 200 });
      }
      if (url === '/api/auth/me' && init?.method === 'PATCH') {
        const body = JSON.parse(init.body as string) as { name: string; email: string };
        currentName = body.name;
        return new Response(JSON.stringify({ ...CURRENT_USER, name: body.name, email: body.email }), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAccountPage();
    await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Jane Editor'));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jane Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Account details updated.')).toBeDefined());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ method: 'PATCH' }),
    );
    // refresh() re-fetches /me - the popover elsewhere in the app
    // would now see the updated name too.
    const getCalls = fetchMock.mock.calls.filter(([input, init]) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      return url === '/api/auth/me' && (init?.method ?? 'GET') === 'GET';
    });
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('a server error updating details is shown inline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me' && (init?.method ?? 'GET') === 'GET') {
          return new Response(JSON.stringify(CURRENT_USER), { status: 200 });
        }
        if (url === '/api/auth/me' && init?.method === 'PATCH') {
          // Mirrors the real shape routes/auth.ts returns - error alone
          // is just "Bad Request", message is the text that must show.
          return new Response(
            JSON.stringify({ statusCode: 400, error: 'Bad Request', message: 'name and email, if provided, must be non-empty' }),
            { status: 400 },
          );
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderAccountPage();
    await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Jane Editor'));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('name and email, if provided, must be non-empty')).toBeDefined());
  });

  it('blocks submission client-side when the new password and confirmation do not match, without calling the server', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(JSON.stringify(CURRENT_USER), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAccountPage();
    await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Jane Editor'));

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new password one' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new password two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(screen.getByText('New password and confirmation do not match')).toBeDefined());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/change-password', expect.anything());
  });

  it('a successful password change clears the fields and shows a confirmation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify(CURRENT_USER), { status: 200 });
        }
        if (url === '/api/auth/change-password' && init?.method === 'POST') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderAccountPage();
    await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Jane Editor'));

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a new password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'a new password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(screen.getByText(/Password changed/)).toBeDefined());
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
  });

  it('a server error changing the password (e.g. wrong current password) is shown inline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(JSON.stringify(CURRENT_USER), { status: 200 });
        }
        if (url === '/api/auth/change-password' && init?.method === 'POST') {
          // Mirrors the real shape routes/auth.ts returns - error alone
          // is just "Unauthorized", message is the text that must show.
          return new Response(
            JSON.stringify({ statusCode: 401, error: 'Unauthorized', message: 'Current password is incorrect' }),
            { status: 401 },
          );
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderAccountPage();
    await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Jane Editor'));

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a new password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'a new password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(screen.getByText('Current password is incorrect')).toBeDefined());
  });
});
