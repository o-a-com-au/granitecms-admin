import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StringListField } from '../../src/sections/StringListField.tsx';
import { createFakeDataTransfer } from '../helpers/fakeDataTransfer.ts';

afterEach(() => {
  cleanup();
});

// Mirrors MenuItemList.test.tsx's own dragOnto helper exactly - jsdom
// never lays anything out, so the target row's bounding rect is mocked.
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

describe('StringListField', () => {
  it('renders one text input per item, in order', () => {
    render(<StringListField value={['First', 'Second']} labelledBy="heading-label" onChange={vi.fn()} />);

    const inputs = screen.getAllByRole('textbox');
    expect(inputs.map((input) => (input as HTMLInputElement).value)).toEqual(['First', 'Second']);
  });

  it('a non-array value renders as an empty list, not a crash', () => {
    render(<StringListField value={undefined} labelledBy="heading-label" onChange={vi.fn()} />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('editing a row calls onChange with that row updated, the others untouched', () => {
    const onChange = vi.fn();
    render(<StringListField value={['First', 'Second']} labelledBy="heading-label" onChange={onChange} />);

    fireEvent.change(screen.getAllByRole('textbox')[1] as HTMLInputElement, { target: { value: 'Changed' } });

    expect(onChange).toHaveBeenCalledWith(['First', 'Changed']);
  });

  it('clicking "Add line" appends an empty entry', () => {
    const onChange = vi.fn();
    render(<StringListField value={['First']} labelledBy="heading-label" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add line' }));

    expect(onChange).toHaveBeenCalledWith(['First', '']);
  });

  it('"Add line" is disabled once maxItems is reached', () => {
    render(<StringListField value={['One', 'Two']} maxItems={2} labelledBy="heading-label" onChange={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Add line' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking a row\'s remove button drops that entry', () => {
    const onChange = vi.fn();
    render(<StringListField value={['First', 'Second', 'Third']} labelledBy="heading-label" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove line 2' }));

    expect(onChange).toHaveBeenCalledWith(['First', 'Third']);
  });

  it('no remove button is offered on any row once minItems would be violated by removing one', () => {
    render(<StringListField value={['Only line']} minItems={1} labelledBy="heading-label" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Remove line/ })).toBeNull();
  });

  it("dragging a row's handle onto another row's position reorders the array and calls onChange", () => {
    const onChange = vi.fn();
    render(<StringListField value={['First', 'Second', 'Third']} labelledBy="heading-label" onChange={onChange} />);

    const handles = screen.getAllByRole('button', { name: /^Drag to reorder /i });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);

    dragOnto(handles[0] as HTMLElement, rows[2] as HTMLElement, 'bottom');

    expect(onChange).toHaveBeenCalledWith(['Second', 'Third', 'First']);
  });

  it('dropping a row back onto its own current gap is a no-op - onChange is never called', () => {
    const onChange = vi.fn();
    render(<StringListField value={['First', 'Second']} labelledBy="heading-label" onChange={onChange} />);

    const handles = screen.getAllByRole('button', { name: /^Drag to reorder /i });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);

    dragOnto(handles[0] as HTMLElement, rows[0] as HTMLElement, 'top');

    expect(onChange).not.toHaveBeenCalled();
  });
});
