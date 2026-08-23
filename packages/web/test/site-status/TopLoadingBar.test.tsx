import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TopLoadingBar } from '../../src/site-status/TopLoadingBar.tsx';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TopLoadingBar', () => {
  it('shows nothing at all before the 300ms threshold', () => {
    render(<TopLoadingBar active />);

    act(() => { vi.advanceTimersByTime(299); });

    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });

  it('appears once the load has genuinely taken longer than 300ms', () => {
    render(<TopLoadingBar active />);

    act(() => { vi.advanceTimersByTime(300); });

    expect(screen.getByRole('status', { name: 'Loading' })).toBeDefined();
  });

  it('never appears at all if the load finishes before the threshold', () => {
    const { rerender } = render(<TopLoadingBar active />);

    act(() => { vi.advanceTimersByTime(100); });
    rerender(<TopLoadingBar active={false} />);
    act(() => { vi.advanceTimersByTime(300); });

    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });

  it('hides immediately once the load finishes, even after it was showing', () => {
    const { rerender } = render(<TopLoadingBar active />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeDefined();

    rerender(<TopLoadingBar active={false} />);

    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });
});
