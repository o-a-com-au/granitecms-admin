import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MenuItemFormModal } from '../../src/menus/MenuItemFormModal.tsx';
import type { SiteMenu } from '../../src/api/site-menus.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const MENU: SiteMenu = {
  path: 'menus/main.json',
  envelope: { schemaVersion: 1 },
  items: [{ label: 'Home', url: '/' }],
  etag: '"etag-1"',
};

describe('MenuItemFormModal', () => {
  it('create mode: appends the new item to the menu\'s own items, with an auto-generated message, then calls onSaved', async () => {
    let receivedBody: unknown;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      receivedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"etag-2"' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    render(<MenuItemFormModal siteId="site-1" menu={MENU} menuName="Main" mode="create" index={null} item={null} onSaved={onSaved} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Add Menu Item' })).toBeDefined();
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Contact' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(receivedBody).toEqual({
      content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }, { label: 'Contact', url: '/contact' }] },
      message: 'Add "Contact" to Main',
    });
  });

  it('edit mode: the fields are pre-filled, and saving replaces only that item by index', async () => {
    let receivedBody: unknown;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      receivedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"etag-2"' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    const twoItemMenu: SiteMenu = { ...MENU, items: [{ label: 'Home', url: '/' }, { label: 'About', url: '/about' }] };

    render(
      <MenuItemFormModal
        siteId="site-1"
        menu={twoItemMenu}
        menuName="Main"
        mode="edit"
        index={1}
        item={{ label: 'About', url: '/about' }}
        onSaved={onSaved}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Edit Menu Item' })).toBeDefined();
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('About');
    expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe('/about');

    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/about-us' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(receivedBody).toEqual({
      content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }, { label: 'About', url: '/about-us' }] },
      message: 'Update "About" in Main',
    });
  });

  it('sends the menu\'s own etag as If-Match', async () => {
    let receivedIfMatch: string | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        receivedIfMatch = (init?.headers as Record<string, string>)['If-Match'];
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"etag-2"' } });
      }),
    );

    render(<MenuItemFormModal siteId="site-1" menu={MENU} menuName="Main" mode="create" index={null} item={null} onSaved={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Contact' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(receivedIfMatch).toBe('"etag-1"'));
  });

  it('shows the server-provided error inline and does not call onSaved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'This menu changed since you opened it' }), { status: 409 })),
    );
    const onSaved = vi.fn();

    render(<MenuItemFormModal siteId="site-1" menu={MENU} menuName="Main" mode="create" index={null} item={null} onSaved={onSaved} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Contact' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('This menu changed since you opened it')).toBeDefined());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('Cancel calls onClose without saving', () => {
    vi.stubGlobal('fetch', vi.fn());
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(<MenuItemFormModal siteId="site-1" menu={MENU} menuName="Main" mode="create" index={null} item={null} onSaved={onSaved} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
