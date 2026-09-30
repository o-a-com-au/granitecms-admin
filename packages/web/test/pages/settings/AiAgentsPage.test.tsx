import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiAgentsPage } from '../../../src/pages/settings/AiAgentsPage.tsx';

const SITES = [
  { id: 'site-a', url: 'https://ember.example' },
  { id: 'site-b', url: 'https://other.example' },
];

const EXISTING_KEY = {
  id: 'hash-1',
  name: 'Claude on my laptop',
  prefix: 'gck_AbCdEf',
  siteIds: ['site-a'],
  permission: 'draft',
  createdAt: '2026-09-30T00:00:00.000Z',
  lastUsedAt: null,
};

function installFakeApi(options: { eligibleSites?: typeof SITES; keys?: unknown[] } = {}) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (method === 'POST') {
        return new Response(JSON.stringify({ key: 'gck_the-secret-key', apiKey: { ...EXISTING_KEY, id: 'hash-2' } }), { status: 201 });
      }
      if (method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ keys: options.keys ?? [], eligibleSites: options.eligibleSites ?? SITES }), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AiAgentsPage', () => {
  it('without the Pro plan, explains that and offers no way to make a key', async () => {
    installFakeApi({ eligibleSites: [] });
    render(<AiAgentsPage />);
    expect(await screen.findByText('Part of the Pro plan')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Create key' })).toBeNull();
  });

  it('creates a key for the chosen websites and permission, and shows it once to copy', async () => {
    const calls = installFakeApi();
    render(<AiAgentsPage />);
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Claude on my laptop' } });
    fireEvent.click(screen.getByLabelText('https://ember.example'));
    fireEvent.click(screen.getByLabelText(/Save drafts and publish/));
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByText('gck_the-secret-key')).toBeDefined();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ name: 'Claude on my laptop', siteIds: ['site-a'], permission: 'publish' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('gck_the-secret-key')).toBeNull();
  });

  it('asks for a website before creating a key', async () => {
    const calls = installFakeApi();
    render(<AiAgentsPage />);
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Claude' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));
    expect(await screen.findByText('Choose at least one website.')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('lists keys by name and prefix, and revokes one after confirming', async () => {
    const calls = installFakeApi({ keys: [EXISTING_KEY] });
    render(<AiAgentsPage />);
    expect(await screen.findByText('Claude on my laptop')).toBeDefined();
    expect(screen.getByText('gck_AbCdEf...')).toBeDefined();
    expect(screen.getByText('Save drafts on https://ember.example')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' }).at(-1) as HTMLElement);
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.url === '/api/api-keys/hash-1')).toBe(true));
  });
});
