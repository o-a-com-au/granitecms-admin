import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../../../src/auth/AuthContext.tsx';
import { PasswordSecurityPage } from '../../../src/pages/settings/PasswordSecurityPage.tsx';
import { PASSWORD_REQUIREMENTS_MESSAGE } from '../../../src/auth/passwordStrength.ts';

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <PasswordSecurityPage />
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PasswordSecurityPage', () => {
  it('blocks submission client-side when the new password and confirmation do not match, without calling the server', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(null, { status: 401 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Password and Security' })).toBeDefined());

    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'old password' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new password one' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new password two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('New password and confirmation do not match')).toBeDefined());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/change-password', expect.anything());
  });

  it('blocks submission client-side when the new password is weak, without calling the server', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(null, { status: 401 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Password and Security' })).toBeDefined());

    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'old password' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'all lowercase' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'all lowercase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // getByRole('alert'), not getByText - the always-visible hint under
    // the field says the same thing, so a text query alone is ambiguous.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PASSWORD_REQUIREMENTS_MESSAGE));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/change-password', expect.anything());
  });

  it('a successful password change clears the fields and shows a confirmation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
        }
        if (url === '/api/auth/change-password' && init?.method === 'POST') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Password and Security' })).toBeDefined());

    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'old password' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'Str0ng Passw0rd!' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Str0ng Passw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/Password changed/)).toBeDefined());
    expect((screen.getByLabelText('Current Password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New Password') as HTMLInputElement).value).toBe('');
  });

  it('a server error changing the password (e.g. wrong current password) is shown inline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
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

    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Password and Security' })).toBeDefined());

    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'wrong password' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'Str0ng Passw0rd!' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Str0ng Passw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Current password is incorrect')).toBeDefined());
  });
});
