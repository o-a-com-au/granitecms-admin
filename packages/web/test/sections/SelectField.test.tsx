import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SelectField } from '../../src/sections/SelectField.tsx';

afterEach(() => {
  cleanup();
});

describe('SelectField', () => {
  it('renders tabs for 3 or fewer short options', () => {
    render(<SelectField value="left" options={['left', 'right']} labelledBy="x" onChange={vi.fn()} />);

    expect(document.querySelector('.select-field-tabs')).not.toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('marks the current value pressed and calls onChange when another tab is clicked', () => {
    const onChange = vi.fn();
    render(<SelectField value="left" options={['left', 'right']} labelledBy="x" onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'left' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'right' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'right' }));
    expect(onChange).toHaveBeenCalledWith('right');
  });

  it('renders a <select> once there are more than 3 options, even if every label is short', () => {
    render(<SelectField value="a" options={['a', 'b', 'c', 'd']} labelledBy="x" onChange={vi.fn()} />);

    expect(document.querySelector('.select-field-tabs')).toBeNull();
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('renders a <select> when a label is too long, even with 3 or fewer options', () => {
    render(
      <SelectField
        value="short"
        options={['short', 'this-label-is-far-too-long-for-a-tab']}
        labelledBy="x"
        onChange={vi.fn()}
      />,
    );

    expect(document.querySelector('.select-field-tabs')).toBeNull();
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  // The longest label 3 tabs can share a row with is shorter than what
  // 2 can - three even thirds have far less room per tab than two even
  // halves (requested directly): 8 characters for 3 options, 14 for 2.
  it('with 3 options, an 8-character label still renders as tabs but a 9-character one falls back to a <select>', () => {
    const { rerender } = render(
      <SelectField value="a" options={['a', 'b', '12345678']} labelledBy="x" onChange={vi.fn()} />,
    );
    expect(document.querySelector('.select-field-tabs')).not.toBeNull();

    rerender(<SelectField value="a" options={['a', 'b', '123456789']} labelledBy="x" onChange={vi.fn()} />);
    expect(document.querySelector('.select-field-tabs')).toBeNull();
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('with 2 options, a 14-character label still renders as tabs but a 15-character one falls back to a <select>', () => {
    const { rerender } = render(
      <SelectField value="a" options={['a', '12345678901234']} labelledBy="x" onChange={vi.fn()} />,
    );
    expect(document.querySelector('.select-field-tabs')).not.toBeNull();

    rerender(<SelectField value="a" options={['a', '123456789012345']} labelledBy="x" onChange={vi.fn()} />);
    expect(document.querySelector('.select-field-tabs')).toBeNull();
    expect(screen.getByRole('combobox')).toBeDefined();
  });

  it('the <select> path still round-trips a selection through onChange', () => {
    const onChange = vi.fn();
    render(<SelectField value="a" options={['a', 'b', 'c', 'd']} labelledBy="x" onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c' } });
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('a non-string enum value still round-trips to its real type via either path', () => {
    const onChange = vi.fn();
    render(<SelectField value={1} options={[1, 2, 3, 4]} labelledBy="x" onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('falls back to an (empty) <select> rather than an empty tab group for an empty options list', () => {
    render(<SelectField value={undefined} options={[]} labelledBy="x" onChange={vi.fn()} />);

    expect(document.querySelector('.select-field-tabs')).toBeNull();
    expect(screen.getByRole('combobox')).toBeDefined();
  });
});
