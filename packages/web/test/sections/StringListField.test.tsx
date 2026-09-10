import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StringListField } from '../../src/sections/StringListField.tsx';
import { createFakeDataTransfer } from '../helpers/fakeDataTransfer.ts';

afterEach(() => {
  cleanup();
});

// Mirrors MenuItemList.test.tsx's own dragOnto helper, fed the
// horizontal axis (clientX / left+width) instead of the vertical one -
// see StringListField.tsx's own handleChipDragOver comment for why the
// same underlying gap maths applies unchanged either way.
function dragOnto(fromChip: HTMLElement, toChip: HTMLElement, half: 'left' | 'right'): void {
  vi.spyOn(toChip, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    height: 0,
    bottom: 0,
    left: 0,
    right: 40,
    width: 40,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  fireEvent.dragStart(fromChip, { dataTransfer: createFakeDataTransfer() });
  fireEvent.dragOver(toChip, { clientX: half === 'left' ? 5 : 35 });
  fireEvent.drop(toChip);
}

describe('StringListField', () => {
  it('renders one chip per item, in order', () => {
    render(<StringListField value={['First', 'Second']} labelledBy="heading-label" onChange={vi.fn()} />);

    const chips = document.querySelectorAll('.string-list-field-chip-text');
    expect(Array.from(chips).map((chip) => chip.textContent)).toEqual(['First', 'Second']);
  });

  it('a non-array value renders as an empty box, not a crash', () => {
    render(<StringListField value={undefined} labelledBy="heading-label" onChange={vi.fn()} />);
    expect(document.querySelectorAll('.string-list-field-chip')).toHaveLength(0);
  });

  it('typing new text and clicking Add appends it as a new chip and clears the input', () => {
    const onChange = vi.fn();
    render(<StringListField value={['First']} labelledBy="heading-label" onChange={onChange} />);

    const input = screen.getByPlaceholderText('New text here') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith(['First', 'Second']);
    expect(input.value).toBe('');
  });

  it('pressing Enter in the input also commits it as a new chip', () => {
    const onChange = vi.fn();
    render(<StringListField value={[]} labelledBy="heading-label" onChange={onChange} />);

    const input = screen.getByPlaceholderText('New text here') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'First' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['First']);
  });

  it('blank or whitespace-only text is never committed', () => {
    const onChange = vi.fn();
    render(<StringListField value={[]} labelledBy="heading-label" onChange={onChange} />);

    const input = screen.getByPlaceholderText('New text here') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('the input and Add button are disabled once maxItems is reached', () => {
    render(<StringListField value={['One', 'Two']} maxItems={2} labelledBy="heading-label" onChange={vi.fn()} />);

    expect((screen.getByPlaceholderText('New text here') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking a chip\'s remove button drops that entry', () => {
    const onChange = vi.fn();
    render(<StringListField value={['First', 'Second', 'Third']} labelledBy="heading-label" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove "Second"' }));

    expect(onChange).toHaveBeenCalledWith(['First', 'Third']);
  });

  it('no remove control is offered on any chip once minItems would be violated by removing one', () => {
    render(<StringListField value={['Only line']} minItems={1} labelledBy="heading-label" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Remove /i })).toBeNull();
  });

  it("dragging a chip onto another chip's position reorders the array and calls onChange", () => {
    const onChange = vi.fn();
    render(<StringListField value={['First', 'Second', 'Third']} labelledBy="heading-label" onChange={onChange} />);

    const chips = Array.from(document.querySelectorAll('.string-list-field-chip')) as HTMLElement[];
    dragOnto(chips[0] as HTMLElement, chips[2] as HTMLElement, 'right');

    expect(onChange).toHaveBeenCalledWith(['Second', 'Third', 'First']);
  });

  it('dropping a chip back onto its own current gap is a no-op - onChange is never called', () => {
    const onChange = vi.fn();
    render(<StringListField value={['First', 'Second']} labelledBy="heading-label" onChange={onChange} />);

    const chips = Array.from(document.querySelectorAll('.string-list-field-chip')) as HTMLElement[];
    dragOnto(chips[0] as HTMLElement, chips[0] as HTMLElement, 'left');

    expect(onChange).not.toHaveBeenCalled();
  });
});
