import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RedirectFormModal } from '../../src/redirects/RedirectFormModal.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RedirectFormModal', () => {
  it('create mode: submits from/to/note and an auto-generated message, then calls onSaved', async () => {
    let receivedBody: unknown;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      receivedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ entry: { from: '/old', to: '/new' }, retargeted: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(<RedirectFormModal siteId="site-1" mode="create" entry={null} onSaved={onSaved} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Add Redirect' })).toBeDefined();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '/old' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '/new' } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'moved page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(receivedBody).toEqual({
      from: '/old',
      to: '/new',
      note: 'moved page',
      message: 'Add redirect from /old to /new',
    });
  });

  it('edit mode: the From field is pre-filled and disabled, only To/Note are editable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ entry: { from: '/old', to: '/newer' }, retargeted: [] }), { status: 200 })),
    );

    render(
      <RedirectFormModal
        siteId="site-1"
        mode="edit"
        entry={{ from: '/old', to: '/new', note: 'moved page' }}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Edit Redirect' })).toBeDefined();
    const fromInput = screen.getByLabelText('From') as HTMLInputElement;
    expect(fromInput.value).toBe('/old');
    expect(fromInput.disabled).toBe(true);
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('/new');
    expect((screen.getByLabelText('Note (optional)') as HTMLInputElement).value).toBe('moved page');
  });

  it('edit mode: submits a PUT with the auto-generated update message', async () => {
    let receivedMethod: string | undefined;
    let receivedBody: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        receivedMethod = init?.method;
        receivedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ entry: { from: '/old', to: '/newer' }, retargeted: [] }), { status: 200 });
      }),
    );
    const onSaved = vi.fn();

    render(
      <RedirectFormModal
        siteId="site-1"
        mode="edit"
        entry={{ from: '/old', to: '/new' }}
        onSaved={onSaved}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '/newer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(receivedMethod).toBe('PUT');
    expect(receivedBody).toEqual({
      from: '/old',
      to: '/newer',
      note: undefined,
      message: 'Update redirect from /old to /newer',
    });
  });

  it('shows the server-provided error inline and does not call onSaved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'A redirect from that path already exists' }), { status: 409 })),
    );
    const onSaved = vi.fn();

    render(<RedirectFormModal siteId="site-1" mode="create" entry={null} onSaved={onSaved} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '/old' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('A redirect from that path already exists')).toBeDefined());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('Cancel calls onClose without saving', () => {
    vi.stubGlobal('fetch', vi.fn());
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(<RedirectFormModal siteId="site-1" mode="create" entry={null} onSaved={onSaved} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
