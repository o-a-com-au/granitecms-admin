import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ColorField } from '../../src/sections/ColorField.tsx';

afterEach(() => {
  cleanup();
});

describe('ColorField - swatch grid (swatches configured)', () => {
  it('always renders "No colour" first, then the declared swatches, then "+"', () => {
    render(<ColorField value="#c2410c" swatches={['#c2410c', '#1d4ed8']} labelledBy="x" onChange={vi.fn()} />);

    const buttons = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(buttons).toEqual(['No colour', '#c2410c', '#1d4ed8', 'Custom colour']);
  });

  it('places a custom (non-preset) value second, right after "No colour"', () => {
    render(<ColorField value="#00ff00" swatches={['#c2410c', '#1d4ed8']} labelledBy="x" onChange={vi.fn()} />);

    const buttons = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(buttons).toEqual(['No colour', 'Current colour: #00ff00', '#c2410c', '#1d4ed8', 'Custom colour']);
  });

  it('renders one button per swatch, marking the current value pressed', () => {
    render(<ColorField value="#1d4ed8" swatches={['#c2410c', '#1d4ed8']} labelledBy="x" onChange={vi.fn()} />);

    const orange = screen.getByRole('button', { name: '#c2410c' });
    const blue = screen.getByRole('button', { name: '#1d4ed8' });
    expect(orange.getAttribute('aria-pressed')).toBe('false');
    expect(blue.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a swatch calls onChange with that swatch, matching case-insensitively', () => {
    const onChange = vi.fn();
    render(<ColorField value="#C2410C" swatches={['#c2410c', '#1d4ed8']} labelledBy="x" onChange={onChange} />);

    expect(screen.getByRole('button', { name: '#c2410c' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '#1d4ed8' }));
    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
  });

  it('renders a "No colour" button, pressed only when the value is unset', () => {
    render(<ColorField value={undefined} swatches={['#c2410c']} labelledBy="x" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'No colour' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking "No colour" clears the value', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={['#c2410c']} labelledBy="x" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'No colour' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows no extra "current colour" cell when the value matches a declared swatch', () => {
    render(<ColorField value="#c2410c" swatches={['#c2410c', '#1d4ed8']} labelledBy="x" onChange={vi.fn()} />);

    expect(screen.queryByLabelText(/^Current colour/)).toBeNull();
  });

  it('shows a leading, pressed "current colour" cell when the value does not match any declared swatch', () => {
    render(<ColorField value="#00ff00" swatches={['#c2410c', '#1d4ed8']} labelledBy="x" onChange={vi.fn()} />);

    const current = screen.getByLabelText('Current colour: #00ff00');
    expect(current.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking the "+" button opens the custom colour popover', () => {
    render(<ColorField value="#c2410c" swatches={['#c2410c']} labelledBy="x" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Custom colour' }));

    expect(screen.getByRole('dialog', { name: 'Choose a colour' })).toBeDefined();
  });

  it('clicking the leading "current colour" cell also opens the popover', () => {
    render(<ColorField value="#00ff00" swatches={['#c2410c']} labelledBy="x" onChange={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Current colour: #00ff00'));

    expect(screen.getByRole('dialog', { name: 'Choose a colour' })).toBeDefined();
  });

  it('picking a colour via the popover\'s hex input commits through onChange', async () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={['#c2410c']} labelledBy="x" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Custom colour' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a colour' });
    const popoverHex = dialog.querySelector('.colour-picker-popover-hex-input') as HTMLInputElement;
    fireEvent.change(popoverHex, { target: { value: '#00ff00' } });
    fireEvent.blur(popoverHex);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('#00ff00'));
  });
});

describe('ColorField - hex row (no swatches configured)', () => {
  function hexInput(): HTMLInputElement {
    return document.querySelector('.colour-field-hex-input') as HTMLInputElement;
  }

  function preview(): HTMLButtonElement {
    return document.querySelector('.colour-field-preview') as HTMLButtonElement;
  }

  it('renders no swatch grid at all', () => {
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={vi.fn()} />);

    expect(document.querySelector('.colour-field-swatch-grid')).toBeNull();
  });

  it('shows the "no colour" style on the preview when unset', () => {
    render(<ColorField value={undefined} swatches={[]} labelledBy="x" onChange={vi.fn()} />);

    expect(preview().className).toContain('colour-field-preview--none');
  });

  it('shows the real colour on the preview once a value is set', () => {
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={vi.fn()} />);

    expect(preview().className).not.toContain('colour-field-preview--none');
    expect(preview().style.backgroundColor).toBe('rgb(194, 65, 12)');
  });

  it('shows the current value in the hex input', () => {
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={vi.fn()} />);

    expect(hexInput().value).toBe('#c2410c');
  });

  it('shows no Clear button while unset, and shows one once a colour is set', () => {
    const { rerender } = render(<ColorField value={undefined} swatches={[]} labelledBy="x" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Clear colour' })).toBeNull();

    rerender(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Clear colour' })).toBeDefined();
  });

  it('Clear resets the value to empty', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear colour' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('typing in the hex input does not commit until blur', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: '#1d4ed8' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(hexInput().value).toBe('#1d4ed8');
  });

  it('blurring the hex input commits a valid 6-digit hex, normalised to lowercase', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: '#1D4ED8' } });
    fireEvent.blur(hexInput());

    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
  });

  it('accepts a 3-digit shorthand hex and expands it to 6 digits', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: 'f0a' } });
    fireEvent.blur(hexInput());

    expect(onChange).toHaveBeenCalledWith('#ff00aa');
  });

  it('pressing Enter commits the hex input immediately, same as blur', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: '#1d4ed8' } });
    fireEvent.keyDown(hexInput(), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
  });

  it('blurring an invalid hex reverts the text back to the current value without calling onChange', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: 'not-a-colour' } });
    fireEvent.blur(hexInput());

    expect(onChange).not.toHaveBeenCalled();
    expect(hexInput().value).toBe('#c2410c');
  });

  it('clearing the hex input entirely and blurring clears the colour, same as the Clear button', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: '' } });
    fireEvent.blur(hexInput());

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clicking the preview opens the custom colour popover', () => {
    render(<ColorField value="#c2410c" swatches={[]} labelledBy="x" onChange={vi.fn()} />);

    fireEvent.click(preview());

    expect(screen.getByRole('dialog', { name: 'Choose a colour' })).toBeDefined();
  });
});
