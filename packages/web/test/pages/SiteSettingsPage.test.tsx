import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { SiteSettingsPage } from '../../src/pages/SiteSettingsPage.tsx';
import { ToastProvider } from '../../src/toast/ToastContext.tsx';
import { PageActionsProvider, PageDeviceToggleProvider } from '../../src/layout/PageActionsContext.tsx';
import { PreviewProvider, usePreview } from '../../src/layout/PreviewContext.tsx';

const SCHEMA = {
  title: 'Site settings',
  type: 'object',
  properties: {
    instagram_url: { type: 'string', title: 'Instagram link' },
    body_font: { type: 'string', title: 'Body font', enum: ['Sans-serif', 'Serif'], default: 'Sans-serif' },
  },
};

function PreviewGenerationProbe() {
  const { previewGeneration } = usePreview();
  return <span data-testid="preview-generation">{previewGeneration}</span>;
}

// Stands in for AppShell: the header's page actions, and the shared
// preview's context.
function Host({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  const [deviceToggle, setDeviceToggle] = useState<ReactNode>(null);
  return (
    <ToastProvider>
      <PreviewProvider siteId="site-1">
        <PageActionsProvider setActions={setActions}>
          <PageDeviceToggleProvider setDeviceToggle={setDeviceToggle}>
            <div data-testid="device-toggle">{deviceToggle}</div>
            <div data-testid="header-actions">{actions}</div>
            {children}
            <PreviewGenerationProbe />
          </PageDeviceToggleProvider>
        </PageActionsProvider>
      </PreviewProvider>
    </ToastProvider>
  );
}

function renderPage() {
  const router = createMemoryRouter(
    [
      {
        path: '/sites/:siteId/settings',
        element: (
          <Host>
            <Link to="/elsewhere">Go elsewhere</Link>
            <SiteSettingsPage />
          </Host>
        ),
      },
      { path: '/elsewhere', element: <p>Somewhere else</p> },
    ],
    { initialEntries: ['/sites/site-1/settings'] },
  );
  return render(<RouterProvider router={router} />);
}

interface Call {
  method: string;
  ifMatch?: string;
  body?: unknown;
}

function installFakeApi(options: { get?: () => Response; put?: () => Response } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/sites/site-1/settings') {
        calls.push({
          method,
          ifMatch: (init?.headers as Record<string, string> | undefined)?.['If-Match'],
          body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        if (method === 'PUT') {
          return options.put?.() ?? new Response('{"ok":true}', { status: 200, headers: { etag: '"s2"' } });
        }
        return (
          options.get?.() ??
          new Response(JSON.stringify({ schema: SCHEMA, settings: { instagram_url: 'https://instagram.com/old' }, resolved: {} }), {
            status: 200,
            headers: { etag: '"s1"' },
          })
        );
      }
      return new Response('{}', { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const headerButton = (name: string) => screen.queryByRole('button', { name });

describe('SiteSettingsPage', () => {
  it('builds its form from the theme\'s settings schema, with no Save until something changes', async () => {
    installFakeApi();
    renderPage();
    const instagram = (await screen.findByLabelText('Instagram link')) as HTMLInputElement;
    expect(instagram.value).toBe('https://instagram.com/old');
    expect(screen.getByLabelText('Body font')).toBeDefined();
    expect(headerButton('Save Changes')).toBeNull();
  });

  it('a change shows Discard and Save in the header; Discard puts the saved values back', async () => {
    installFakeApi();
    renderPage();
    const instagram = (await screen.findByLabelText('Instagram link')) as HTMLInputElement;
    fireEvent.change(instagram, { target: { value: 'https://instagram.com/new' } });
    expect(headerButton('Save Changes')).not.toBeNull();

    fireEvent.click(headerButton('Discard Changes') as HTMLElement);
    expect(((await screen.findByLabelText('Instagram link')) as HTMLInputElement).value).toBe('https://instagram.com/old');
    expect(headerButton('Save Changes')).toBeNull();
  });

  it('Save sends the values with the ETag, reloads the preview, and clears the header buttons', async () => {
    const calls = installFakeApi();
    renderPage();
    fireEvent.change(await screen.findByLabelText('Instagram link'), { target: { value: 'https://instagram.com/new' } });
    fireEvent.click(headerButton('Save Changes') as HTMLElement);

    await waitFor(() => expect(headerButton('Save Changes')).toBeNull());
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.ifMatch).toBe('"s1"');
    expect(put?.body).toEqual({ settings: { instagram_url: 'https://instagram.com/new' }, message: 'Update site settings' });
    expect(Number(screen.getByTestId('preview-generation').textContent)).toBeGreaterThan(0);
    expect(await screen.findByText('Site settings saved. They are live now.')).toBeDefined();
  });

  it('a value the site rejects is shown on its own field, and the change stays for fixing', async () => {
    installFakeApi({
      put: () =>
        new Response(
          JSON.stringify({
            message: 'Site settings failed validation',
            errors: [{ path: '/instagram_url', message: 'must be a string', keyword: 'type' }],
          }),
          { status: 400 },
        ),
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Instagram link'), { target: { value: 'nope' } });
    fireEvent.click(headerButton('Save Changes') as HTMLElement);
    await waitFor(() => expect(screen.getAllByText(/must be a string|Site settings failed validation/i).length).toBeGreaterThan(0));
    expect(headerButton('Save Changes')).not.toBeNull();
  });

  it('a conflicting save says someone else changed the settings', async () => {
    installFakeApi({ put: () => new Response(JSON.stringify({ message: 'changed' }), { status: 409 }) });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Instagram link'), { target: { value: 'https://instagram.com/new' } });
    fireEvent.click(headerButton('Save Changes') as HTMLElement);
    expect(await screen.findByText(/Someone else changed the site settings/)).toBeDefined();
  });

  it('explains a theme with no site settings, and a website whose CMS is too old for them', async () => {
    installFakeApi({ get: () => new Response(JSON.stringify({ schema: null, settings: {}, resolved: {} }), { status: 200 }) });
    renderPage();
    expect(await screen.findByText(/has no site settings yet/)).toBeDefined();
    cleanup();

    installFakeApi({
      get: () => new Response(JSON.stringify({ error: 'This website\'s CMS is too old for site settings. Upgrade it to 0.7.0 or later.', reason: 'unsupported' }), { status: 404 }),
    });
    renderPage();
    expect(await screen.findByText(/too old for site settings/)).toBeDefined();
  });

  it('leaving with unsaved changes asks first, and stays unless confirmed', async () => {
    installFakeApi();
    renderPage();
    fireEvent.change(await screen.findByLabelText('Instagram link'), { target: { value: 'https://instagram.com/new' } });
    fireEvent.click(screen.getByText('Go elsewhere'));
    expect(await screen.findByRole('alertdialog')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Somewhere else')).toBeNull();

    fireEvent.click(screen.getByText('Go elsewhere'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard Changes' }));
    expect(await screen.findByText('Somewhere else')).toBeDefined();
  });
});
