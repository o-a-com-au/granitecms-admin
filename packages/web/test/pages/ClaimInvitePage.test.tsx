import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../../src/auth/AuthContext.tsx';
import { ClaimInvitePage } from '../../src/pages/ClaimInvitePage.tsx';
import { createFakeStorage } from '../helpers/fakeStorage.ts';
import { PASSWORD_REQUIREMENTS_MESSAGE } from '../../src/auth/passwordStrength.ts';

const CODE = 'abc123';

function renderClaimPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[`/invite/${CODE}`]}>
        <Routes>
          <Route path="/invite/:code" element={<ClaimInvitePage />} />
          <Route path="/sites/:siteId/editor" element={<div>editor page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClaimInvitePage', () => {
  it('an unauthenticated visitor sees the target site, a read-only email, and a signup form', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
        }
        if (url === `/api/invites/${CODE}`) {
          return new Response(
            JSON.stringify({ valid: true, siteUrl: 'https://client-one.example.com', email: 'client@example.com' }),
            { status: 200 },
          );
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderClaimPage();

    await waitFor(() => expect(screen.getByText(/You've been invited to manage https:\/\/client-one\.example\.com/)).toBeDefined());
    const emailField = screen.getByLabelText('Email') as HTMLInputElement;
    expect(emailField.value).toBe('client@example.com');
    expect(emailField.disabled).toBe(true);
    expect(screen.getByLabelText('Name')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Accept invite' })).toBeNull();
  });

  it('an authenticated visitor sees a single accept button, no form', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(
            JSON.stringify({ id: 'dev-1', username: 'dev-1', name: 'Dev One', email: 'dev@example.com', role: 'developer', status: 'active' }),
            { status: 200 },
          );
        }
        if (url === `/api/invites/${CODE}`) {
          return new Response(
            JSON.stringify({ valid: true, siteUrl: 'https://client-one.example.com', email: 'client@example.com' }),
            { status: 200 },
          );
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderClaimPage();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept invite' })).toBeDefined());
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('accepting while authenticated calls claim with no body and lands in the site editor', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(
          JSON.stringify({ id: 'dev-1', username: 'dev-1', name: 'Dev One', email: 'dev@example.com', role: 'developer', status: 'active' }),
          { status: 200 },
        );
      }
      if (url === `/api/invites/${CODE}`) {
        return new Response(
          JSON.stringify({ valid: true, siteUrl: 'https://client-one.example.com', email: 'client@example.com' }),
          { status: 200 },
        );
      }
      if (url === `/api/invites/${CODE}/claim` && init?.method === 'POST') {
        expect(init.body).toBeUndefined();
        return new Response(JSON.stringify({ siteId: 'site-1' }), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderClaimPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept invite' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Accept invite' }));

    await waitFor(() => expect(screen.getByText('editor page')).toBeDefined());
  });

  it('signing up while unauthenticated submits name/password and lands in the site editor already logged in', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    let loggedIn = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        if (loggedIn) {
          return new Response(
            JSON.stringify({ id: 'client@example.com', username: 'client@example.com', name: 'New Client', email: 'client@example.com', role: 'client', status: 'active' }),
            { status: 200 },
          );
        }
        return new Response(null, { status: 401 });
      }
      if (url === `/api/invites/${CODE}`) {
        return new Response(
          JSON.stringify({ valid: true, siteUrl: 'https://client-one.example.com', email: 'client@example.com' }),
          { status: 200 },
        );
      }
      if (url === `/api/invites/${CODE}/claim` && init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as { name: string; password: string };
        expect(body).toEqual({ name: 'New Client', password: 'Str0ng Passw0rd!' });
        loggedIn = true;
        return new Response(JSON.stringify({ siteId: 'site-1' }), { status: 200 });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderClaimPage();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Client' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Str0ng Passw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.getByText('editor page')).toBeDefined());
  });

  it('a weak password is rejected client-side, with no network call to claim', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return new Response(null, { status: 401 });
      }
      if (url === `/api/invites/${CODE}`) {
        return new Response(
          JSON.stringify({ valid: true, siteUrl: 'https://client-one.example.com', email: 'client@example.com' }),
          { status: 200 },
        );
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderClaimPage();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Client' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'all lowercase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    // getByRole('alert'), not getByText - the always-visible hint under
    // the field says the same thing, so a text query alone is ambiguous.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(PASSWORD_REQUIREMENTS_MESSAGE));
    expect(fetchMock).not.toHaveBeenCalledWith(`/api/invites/${CODE}/claim`, expect.anything());
  });

  it('claiming with an email that already has an account surfaces the server error inline', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
        }
        if (url === `/api/invites/${CODE}`) {
          return new Response(
            JSON.stringify({ valid: true, siteUrl: 'https://client-one.example.com', email: 'client@example.com' }),
            { status: 200 },
          );
        }
        if (url === `/api/invites/${CODE}/claim` && init?.method === 'POST') {
          // Mirrors the real shape routes/site-invites.ts returns - error
          // alone is just "Conflict", message is the text that must show.
          return new Response(
            JSON.stringify({
              statusCode: 409,
              error: 'Conflict',
              message: 'An account with this email already exists - log in and open the invite link again',
            }),
            { status: 409 },
          );
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderClaimPage();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Client' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Str0ng Passw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByText('An account with this email already exists - log in and open the invite link again')).toBeDefined(),
    );
  });

  it('shows a clear message for an expired invite, with no form at all', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
        }
        if (url === `/api/invites/${CODE}`) {
          return new Response(JSON.stringify({ valid: false, reason: 'expired' }), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderClaimPage();

    await waitFor(() => expect(screen.getByText(/This invite has expired/)).toBeDefined());
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('shows a clear message for an already-claimed invite', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
        }
        if (url === `/api/invites/${CODE}`) {
          return new Response(JSON.stringify({ valid: false, reason: 'claimed' }), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderClaimPage();

    await waitFor(() => expect(screen.getByText(/This invite has already been used/)).toBeDefined());
  });

  it('shows a clear message for an invalid code', async () => {
    vi.stubGlobal('localStorage', createFakeStorage());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/auth/me') {
          return new Response(null, { status: 401 });
        }
        if (url === `/api/invites/${CODE}`) {
          return new Response(JSON.stringify({ valid: false, reason: 'not-found' }), { status: 200 });
        }
        throw new Error(`unhandled fetch in test: ${url}`);
      }),
    );

    renderClaimPage();

    await waitFor(() => expect(screen.getByText('This invite is not valid.')).toBeDefined());
  });
});
