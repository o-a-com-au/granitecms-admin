import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { SiteConnectionPanel } from '../../src/sites/SiteConnectionPanel.tsx';

const OK_STATUS = { state: 'ok' as const, agentVersion: '1.0.0', contentSchemaVersion: 1, sqliteDriver: 'node:sqlite' };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SiteConnectionPanel', () => {
  it('shows a checking beat first, not the real caption, right on mount', () => {
    render(<SiteConnectionPanel status={OK_STATUS} />);

    expect(screen.getByText('Checking connection...')).toBeDefined();
    expect(screen.queryByText('Strong Connection')).toBeNull();
  });

  it('reveals the real result once the checking beat finishes', () => {
    render(<SiteConnectionPanel status={OK_STATUS} />);

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.queryByText('Checking connection...')).toBeNull();
    expect(screen.getByText('Strong Connection')).toBeDefined();
  });

  it('an unauthorized site reveals "Check Token" once checking finishes', () => {
    render(<SiteConnectionPanel status={{ state: 'unauthorized', message: 'The stored token was rejected' }} />);

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByText('Check Token')).toBeDefined();
  });

  it('an unreachable site reveals "Unreachable" once checking finishes', () => {
    render(<SiteConnectionPanel status={{ state: 'unreachable', message: 'Could not reach the site' }} />);

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByText('Unreachable')).toBeDefined();
  });

  it('a generic error reveals "Connection Error" once checking finishes', () => {
    render(<SiteConnectionPanel status={{ state: 'error', message: 'Unexpected response' }} />);

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByText('Connection Error')).toBeDefined();
  });
});
