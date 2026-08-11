import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeviceToggle } from '../../src/editor/DeviceToggle.tsx';

describe('DeviceToggle', () => {
  it('marks the current device tier as pressed, and no other', () => {
    render(<DeviceToggle device="tablet" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Tablet preview' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Desktop preview' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Mobile preview' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onChange with the clicked tier', () => {
    const onChange = vi.fn();
    render(<DeviceToggle device="desktop" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mobile preview' }));

    expect(onChange).toHaveBeenCalledWith('mobile');
  });
});
