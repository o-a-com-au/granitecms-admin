import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { RegisterSitePage } from '../../../src/pages/settings/RegisterSitePage.tsx';

// Moved out of ManageSitesPage.test.tsx alongside the form itself
// (requested directly - registering now lives on its own route).
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/sites/new']}>
      <Routes>
        <Route path="/settings/sites/new" element={<RegisterSitePage />} />
        <Route path="/settings/sites" element={<div>the registry</div>} />
        <Route path="/" element={<div>redirected home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegisterSitePage', () => {
  it('links back to the registry', () => {
    renderPage();
    expect(screen.getByRole('link', { name: '← Manage Websites' }).getAttribute('href')).toBe('/settings/sites');
  });

  it('registering a site navigates home so it becomes the current site', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/sites' && method === 'POST') {
          const body = JSON.parse(init?.body as string) as { url: string; token: string };
          const now = new Date().toISOString();
          return new Response(
            JSON.stringify({
              id: 'site-1',
              url: body.url,
              createdAt: now,
              updatedAt: now,
              status: { state: 'ok', agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' },
            }),
            { status: 201 },
          );
        }
        throw new Error(`unhandled fetch in test: ${method} ${url}`);
      }),
    );
    renderPage();

    fireEvent.change(screen.getByLabelText('Website URL'), { target: { value: 'https://client-one.example.com' } });
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText('redirected home')).toBeDefined());
  });

  it('a registration error is shown inline without navigating away', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';
        if (url === '/api/sites' && method === 'POST') {
          return new Response(JSON.stringify({ error: 'Could not reach that site' }), { status: 502 });
        }
        throw new Error(`unhandled fetch in test: ${method} ${url}`);
      }),
    );
    renderPage();

    fireEvent.change(screen.getByLabelText('Website URL'), { target: { value: 'https://client-one.example.com' } });
    fireEvent.change(screen.getByLabelText('API Token'), { target: { value: 'a-real-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(screen.getByText('Could not reach that site')).toBeDefined());
    expect(screen.queryByText('redirected home')).toBeNull();
  });
});
