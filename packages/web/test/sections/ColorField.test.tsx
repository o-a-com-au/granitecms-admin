import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColorField } from '../../src/sections/ColorField.tsx';

afterEach(() => {
  cleanup();
});

describe('ColorField', () => {
  function nativeColorInput(): HTMLInputElement {
    return document.querySelector('input[type="color"]') as HTMLInputElement;
  }

  function hexInput(): HTMLInputElement {
    return document.querySelector('.colour-field-hex-input') as HTMLInputElement;
  }

  it('renders no swatch group when the list is empty', () => {
    render(<ColorField value="#c2410c" swatches={[]} onChange={vi.fn()} />);

    expect(screen.queryByRole('group')).toBeNull();
    expect(nativeColorInput().value).toBe('#c2410c');
  });

  it('renders one button per swatch, marking the current value pressed', () => {
    render(<ColorField value="#1d4ed8" swatches={['#c2410c', '#1d4ed8']} onChange={vi.fn()} />);

    const orange = screen.getByRole('button', { name: '#c2410c' });
    const blue = screen.getByRole('button', { name: '#1d4ed8' });
    expect(orange.getAttribute('aria-pressed')).toBe('false');
    expect(blue.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a swatch calls onChange with that swatch, matching case-insensitively', () => {
    const onChange = vi.fn();
    render(<ColorField value="#C2410C" swatches={['#c2410c', '#1d4ed8']} onChange={onChange} />);

    expect(screen.getByRole('button', { name: '#c2410c' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '#1d4ed8' }));
    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
  });

  it('the native colour input still accepts a value outside the swatch list', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={['#c2410c', '#1d4ed8']} onChange={onChange} />);

    fireEvent.change(nativeColorInput(), { target: { value: '#00ff00' } });
    expect(onChange).toHaveBeenCalledWith('#00ff00');
  });

  it('defaults an absent/empty value to black for the native input', () => {
    render(<ColorField value={undefined} swatches={[]} onChange={vi.fn()} />);

    expect(nativeColorInput().value).toBe('#000000');
  });

  it('shows no Clear button when no colour is set', () => {
    render(<ColorField value={undefined} swatches={[]} onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('Clear resets the value to empty once a colour is set', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows the current value in the hex text input too', () => {
    render(<ColorField value="#c2410c" swatches={[]} onChange={vi.fn()} />);

    expect(hexInput().value).toBe('#c2410c');
  });

  it('typing in the hex input does not commit until blur', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: '#1d4ed8' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(hexInput().value).toBe('#1d4ed8');
  });

  it('blurring the hex input commits a valid 6-digit hex, normalised to lowercase', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: '#1D4ED8' } });
    fireEvent.blur(hexInput());

    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
  });

  it('accepts a 3-digit shorthand hex and expands it to 6 digits', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: 'f0a' } });
    fireEvent.blur(hexInput());

    expect(onChange).toHaveBeenCalledWith('#ff00aa');
  });

  it('pressing Enter commits the hex input immediately, same as blur', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: '#1d4ed8' } });
    fireEvent.keyDown(hexInput(), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
  });

  it('blurring an invalid hex reverts the text back to the current value without calling onChange', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: 'not-a-colour' } });
    fireEvent.blur(hexInput());

    expect(onChange).not.toHaveBeenCalled();
    expect(hexInput().value).toBe('#c2410c');
  });

  it('clearing the hex input entirely and blurring clears the colour, same as the Clear button', () => {
    const onChange = vi.fn();
    render(<ColorField value="#c2410c" swatches={[]} onChange={onChange} />);

    fireEvent.change(hexInput(), { target: { value: '' } });
    fireEvent.blur(hexInput());

    expect(onChange).toHaveBeenCalledWith('');
  });
});
