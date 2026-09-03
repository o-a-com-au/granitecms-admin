import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MenuItemList } from '../../src/menus/MenuItemList.tsx';
import type { MenuItem } from '../../src/api/site-menus.ts';
import { createFakeDataTransfer } from '../helpers/fakeDataTransfer.ts';

afterEach(() => {
  cleanup();
});

const ITEMS: MenuItem[] = [
  { label: 'Home', url: '/' },
  { label: 'About', url: '/about' },
  { label: 'Contact', url: '/contact' },
];

// Simulates dragging fromHandle onto toRow, landing in either the top
// or bottom half of toRow's (mocked, since jsdom never lays anything
// out) bounding rect - mirrors BlockList.test.tsx's own dragOnto helper.
function dragOnto(fromHandle: HTMLElement, toRow: HTMLElement, half: 'top' | 'bottom'): void {
  vi.spyOn(toRow, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    height: 40,
    bottom: 40,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  fireEvent.dragStart(fromHandle, { dataTransfer: createFakeDataTransfer() });
  fireEvent.dragOver(toRow, { clientY: half === 'top' ? 5 : 35 });
  fireEvent.drop(toRow);
}

describe('MenuItemList', () => {
  it('renders each item with a drag handle, no chevron/spacer at all - an item never nests', () => {
    render(<MenuItemList items={ITEMS} onReorder={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Drag to reorder Home' })).toHaveLength(1);
    expect(document.querySelector('.instance-row-chevron')).toBeNull();
    expect(document.querySelector('.instance-row-chevron-spacer')).toBeNull();
  });

  it('dragging a row\'s handle onto another row reorders the array and calls onReorder', () => {
    const onReorder = vi.fn();
    render(<MenuItemList items={ITEMS} onReorder={onReorder} onEdit={vi.fn()} onDelete={vi.fn()} />);

    const handles = screen.getAllByRole('button', { name: /^Drag to reorder /i });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);

    dragOnto(handles[0] as HTMLElement, rows[2] as HTMLElement, 'bottom');

    expect(onReorder).toHaveBeenCalledWith([
      { label: 'About', url: '/about' },
      { label: 'Contact', url: '/contact' },
      { label: 'Home', url: '/' },
    ]);
  });

  it('dropping a row back onto its own current gap is a no-op - onReorder is never called', () => {
    const onReorder = vi.fn();
    render(<MenuItemList items={ITEMS} onReorder={onReorder} onEdit={vi.fn()} onDelete={vi.fn()} />);

    const handles = screen.getAllByRole('button', { name: /^Drag to reorder /i });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);

    // Dragging a row onto its own top half resolves to the same gap it
    // already occupies - see BlockList.test.tsx's own equivalent case.
    dragOnto(handles[0] as HTMLElement, rows[0] as HTMLElement, 'top');

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("clicking an item's edit/delete buttons calls onEdit/onDelete with that item's own index", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<MenuItemList items={ITEMS} onReorder={vi.fn()} onEdit={onEdit} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit About' }));
    expect(onEdit).toHaveBeenCalledWith(1, { label: 'About', url: '/about' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete Contact' }));
    expect(onDelete).toHaveBeenCalledWith(2, { label: 'Contact', url: '/contact' });
  });
});
