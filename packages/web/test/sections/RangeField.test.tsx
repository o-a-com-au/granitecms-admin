import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RangeField } from '../../src/sections/RangeField.tsx';

afterEach(() => {
  cleanup();
});

describe('RangeField', () => {
  it('renders a range slider and a number box both bound to the current value', () => {
    render(<RangeField value={16} minimum={12} maximum={24} step={1} onChange={vi.fn()} />);

    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    const number = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(slider.value).toBe('16');
    expect(number.value).toBe('16');
  });

  it('defaults an absent value to minimum', () => {
    render(<RangeField value={undefined} minimum={12} maximum={24} step={1} onChange={vi.fn()} />);

    expect((document.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('12');
  });

  it('shows the unit suffix when provided, and omits it when absent', () => {
    const { rerender } = render(<RangeField value={16} minimum={12} maximum={24} step={1} unit="px" onChange={vi.fn()} />);
    expect(screen.getByText('px')).toBeDefined();

    rerender(<RangeField value={16} minimum={12} maximum={24} step={1} onChange={vi.fn()} />);
    expect(screen.queryByText('px')).toBeNull();
  });

  it('dragging the slider commits immediately, clamped and rounded to the nearest step', () => {
    const onChange = vi.fn();
    render(<RangeField value={15} minimum={10} maximum={24} step={5} onChange={onChange} />);

    fireEvent.change(document.querySelector('input[type="range"]') as HTMLInputElement, { target: { value: '19' } });

    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('typing in the number box does not commit until blur', () => {
    const onChange = vi.fn();
    render(<RangeField value={16} minimum={12} maximum={24} step={1} onChange={onChange} />);

    const number = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(number, { target: { value: '2' } });

    expect(number.value).toBe('2');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('blurring the number box reverts an out-of-range value to the nearest bound', () => {
    const onChange = vi.fn();
    render(<RangeField value={16} minimum={12} maximum={24} step={1} onChange={onChange} />);

    const number = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(number, { target: { value: '2' } });
    fireEvent.blur(number);

    expect(onChange).toHaveBeenCalledWith(12);
  });

  it('blurring the number box rounds a value that does not land on a step', () => {
    const onChange = vi.fn();
    render(<RangeField value={12} minimum={12} maximum={24} step={5} onChange={onChange} />);

    const number = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(number, { target: { value: '19' } });
    fireEvent.blur(number);

    expect(onChange).toHaveBeenCalledWith(17);
  });

  it('blurring with non-numeric text reverts the box back to the current value without calling onChange', () => {
    const onChange = vi.fn();
    render(<RangeField value={16} minimum={12} maximum={24} step={1} onChange={onChange} />);

    const number = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(number, { target: { value: 'abc' } });
    fireEvent.blur(number);

    expect(onChange).not.toHaveBeenCalled();
    expect(number.value).toBe('16');
  });
});
