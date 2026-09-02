import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { OnboardingPage } from '../../src/pages/OnboardingPage.tsx';

function installFakeSitesApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (url === '/api/sites' && method === 'POST') {
        const body = JSON.parse(init?.body as string) as { url: string; token: string };
        return new Response(
          JSON.stringify({
            id: 'site-1',
            url: body.url,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
          }),
          { status: 201 },
        );
      }

      throw new Error(`unhandled fetch in test: ${method} ${url}`);
    }),
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/" element={<div>redirected home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Advances from step 1 (Website URL) to step 2 (API Token) - the shared
// setup every test past the first one needs.
function goToStep2(url = 'https://client-one.example.com'): void {
  fireEvent.change(screen.getByLabelText('Website URL'), { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OnboardingPage', () => {
  it('starts on step 1 (Website URL only), with no sidebar or Active websites list', () => {
    renderPage();

    expect(screen.getByText(/Welcome to Granite CMS/)).toBeDefined();
    expect(screen.getByLabelText('Website URL')).toBeDefined();
    expect(screen.queryByLabelText('API Token')).toBeNull();
    expect(screen.queryByText('Register a website')).toBeNull();
    expect(screen.queryByText('Active websites')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Settings' })).toBeNull();
  });

  it('Continue advances to step 2 (API Token), keeping the entered URL', () => {
    renderPage();

    goToStep2('https://client-one.example.com');

    expect(screen.queryByLabelText('Website URL')).toBeNull();
    expect(screen.getByLabelText('API Token')).toBeDefined();

    // Back returns to step 1 with the URL still filled in, not reset.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect((screen.getByLabelText('Website URL') as HTMLInputElement).value).toBe('https://client-one.example.com');
  });

  it('registering on step 2 navigates back to "/" so the new site becomes current', async () => {
    installFakeSitesApi();
    renderPage();

    goToStep2();
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText('redirected home')).toBeDefined());
  });

  it('a registration error is shown inline on step 2, without navigating away', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Could not reach that site' }), { status: 502 })),
    );
    renderPage();

    goToStep2();
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText('Could not reach that site')).toBeDefined());
    expect(screen.getByLabelText('API Token')).toBeDefined();
  });
});
