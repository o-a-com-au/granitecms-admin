import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AssistantPage } from '../../src/assistant/AssistantPage.tsx';
import { ToastProvider } from '../../src/toast/ToastContext.tsx';
import { PageActionsProvider, PageDeviceToggleProvider } from '../../src/layout/PageActionsContext.tsx';
import { PreviewProvider } from '../../src/layout/PreviewContext.tsx';

// Stands in for AppShell: the header's page actions, and the shared
// preview's context.
function Host({ children }: { children: ReactNode }) {
  const [, setActions] = useState<ReactNode>(null);
  const [, setDeviceToggle] = useState<ReactNode>(null);
  return (
    <ToastProvider>
      <PreviewProvider siteId="site-1">
        <PageActionsProvider setActions={setActions}>
          <PageDeviceToggleProvider setDeviceToggle={setDeviceToggle}>{children}</PageDeviceToggleProvider>
        </PageActionsProvider>
      </PreviewProvider>
    </ToastProvider>
  );
}

function renderPage() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 404 })),
  );
  const router = createMemoryRouter(
    [
      {
        path: '/sites/:siteId/assistant',
        element: (
          <Host>
            <AssistantPage />
          </Host>
        ),
      },
    ],
    { initialEntries: ['/sites/site-1/assistant'] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AssistantPage', () => {
  it('starts empty with suggestions that fill the message box', () => {
    renderPage();
    expect(screen.getByText('How can I help with your website?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Which pages mention' }));
    expect((screen.getByLabelText('Message the assistant') as HTMLTextAreaElement).value).toBe('Which pages mention ');
  });

  it('sends with Enter (Shift+Enter does not), shows the reply, and New chat clears it', () => {
    renderPage();
    const input = screen.getByLabelText('Message the assistant');
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'Hello there' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getAllByRole('listitem')[0]?.textContent).toBe('Hello there');
    expect(screen.getByText(/not connected yet/)).toBeDefined();
    expect((input as HTMLTextAreaElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('How can I help with your website?')).toBeDefined();
  });
});
