import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToggleField } from '../../src/sections/ToggleField.tsx';

afterEach(() => {
  cleanup();
});

describe('ToggleField', () => {
  it('renders a real checkbox, reflecting the current checked state', () => {
    render(<ToggleField checked={true} onChange={vi.fn()} />);

    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('clicking the (visually hidden) checkbox still fires onChange, native semantics intact', () => {
    const onChange = vi.fn();
    render(<ToggleField checked={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});
