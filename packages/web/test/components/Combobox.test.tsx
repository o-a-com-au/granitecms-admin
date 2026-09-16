import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Combobox } from '../../src/components/Combobox.tsx';

const OPTIONS = ['page', 'project', 'article'];

function renderCombobox(value = '', onChange = vi.fn()) {
  return { onChange, ...render(<Combobox value={value} options={OPTIONS} onChange={onChange} />) };
}

describe('Combobox', () => {
  it('accepts a value that is not in the options at all - suggestions never restrict', () => {
    const { onChange } = renderCombobox();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'case-study' } });

    expect(onChange).toHaveBeenCalledWith('case-study');
  });

  it('opens on the toggle and offers every known value', () => {
    renderCombobox();

    fireEvent.click(screen.getByRole('button', { hidden: true }));

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(OPTIONS);
  });

  it('narrows the suggestions as you type, without blocking what was typed', () => {
    renderCombobox();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'art' } });

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['article']);
  });

  it('shows no list at all when nothing matches, rather than an empty popover', () => {
    renderCombobox();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nothing-like-this' } });

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opening an already-set value still offers every type, so a choice can be changed', () => {
    // Filtering on the committed value would leave only "project" here,
    // making the dropdown useless for switching away from it.
    renderCombobox('project');

    fireEvent.click(screen.getByRole('button', { hidden: true }));

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(OPTIONS);
  });

  it('picking a suggestion commits it and closes the list', () => {
    const { onChange } = renderCombobox();

    fireEvent.click(screen.getByRole('button', { hidden: true }));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'project' }));

    expect(onChange).toHaveBeenCalledWith('project');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('arrow keys move through the suggestions and Enter commits the active one', () => {
    const { onChange } = renderCombobox();
    const input = screen.getByRole('combobox');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('page');
  });

  it('Enter with nothing highlighted leaves the typed value alone, for the form to handle', () => {
    const { onChange } = renderCombobox('brand-new');
    const input = screen.getByRole('combobox');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Escape closed the list, so Enter is not choosing a suggestion and
    // must not overwrite what the user actually typed.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape closes the list without changing the value', () => {
    const { onChange } = renderCombobox();
    const input = screen.getByRole('combobox');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeDefined();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports expansion state for assistive technology', () => {
    renderCombobox();
    const input = screen.getByRole('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('true');
  });
});
