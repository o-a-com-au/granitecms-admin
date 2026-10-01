import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

interface AssistantCall {
  messages: Array<{ role: string; text: string }>;
  currentUrl: string | null;
}

// Answers the assistant route with a stream of events (one per line);
// everything else the page asks for is a 404.
function renderPage(answer: (call: AssistantCall) => Response = () => streamOf([{ type: 'done' }])) {
  const calls: AssistantCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === '/api/sites/site-1/assistant') {
        const call = JSON.parse(init?.body as string) as AssistantCall;
        calls.push(call);
        return answer(call);
      }
      return new Response('{}', { status: 404 });
    }),
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
  render(<RouterProvider router={router} />);
  return calls;
}

function streamOf(events: unknown[]): Response {
  const body = events.map((event) => `${JSON.stringify(event)}\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
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

  it('sends with Enter (Shift+Enter does not), streams the reply in, and sends the conversation so far next time', async () => {
    const calls = renderPage((call) =>
      call.messages.length === 1
        ? streamOf([
            { type: 'tool', label: 'Looking through the pages' },
            { type: 'text', text: 'You have **two** pages:\n- Home\n' },
            { type: 'text', text: '- Tastings' },
            { type: 'done' },
          ])
        : streamOf([{ type: 'text', text: 'Sure.' }, { type: 'done' }]),
    );
    const input = screen.getByLabelText('Message the assistant');
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'Which pages do I have?' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(calls).toHaveLength(0);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect((input as HTMLTextAreaElement).value).toBe('');
    await waitFor(() => expect(screen.getByText('two').tagName).toBe('STRONG'));
    expect(screen.getByText('Tastings').tagName).toBe('LI');
    expect(calls[0]).toEqual({ messages: [{ role: 'user', text: 'Which pages do I have?' }], currentUrl: null });

    fireEvent.change(input, { target: { value: 'Thanks' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Sure.')).toBeDefined());
    expect(calls[1]?.messages).toEqual([
      { role: 'user', text: 'Which pages do I have?' },
      { role: 'assistant', text: 'You have **two** pages:\n- Home\n- Tastings' },
      { role: 'user', text: 'Thanks' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('How can I help with your website?')).toBeDefined();
  });

  it('shows a refusal (not on Pro) as the reply, and leaves it out of the next message', async () => {
    const calls = renderPage((call) =>
      call.messages.length === 1
        ? new Response(JSON.stringify({ error: 'The assistant is part of the Pro plan.', reason: 'plan' }), { status: 403 })
        : streamOf([{ type: 'done' }]),
    );
    const input = screen.getByLabelText('Message the assistant');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('The assistant is part of the Pro plan.')).toBeDefined());

    fireEvent.change(input, { target: { value: 'Again' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.messages).toEqual([
      { role: 'user', text: 'Hello' },
      { role: 'user', text: 'Again' },
    ]);
  });

  it('shows the error the server streams when the assistant fails part-way', async () => {
    renderPage(() => streamOf([{ type: 'error', message: 'The assistant is busy right now. Try again in a minute.' }]));
    const input = screen.getByLabelText('Message the assistant');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('The assistant is busy right now. Try again in a minute.')).toBeDefined());
  });
});
