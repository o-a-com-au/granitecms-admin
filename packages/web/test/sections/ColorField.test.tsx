import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColorField } from '../../src/sections/ColorField.tsx';

afterEach(() => {
  cleanup();
});

describe('ColorField', () => {
  it('renders no swatch group when the list is empty', () => {
    render(<ColorField value="#c2410c" swatches={[]} onChange={vi.fn()} />);

    expect(screen.queryByRole('group')).toBeNull();
    expect((screen.getByDisplayValue('#c2410c') as HTMLInputElement).type).toBe('color');
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

    fireEvent.change(screen.getByDisplayValue('#c2410c'), { target: { value: '#00ff00' } });
    expect(onChange).toHaveBeenCalledWith('#00ff00');
  });

  it('defaults an absent/empty value to black for the native input', () => {
    render(<ColorField value={undefined} swatches={[]} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue('#000000')).toBeDefined();
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
});
