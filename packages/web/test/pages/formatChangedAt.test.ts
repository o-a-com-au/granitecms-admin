import { describe, expect, it } from 'vitest';
import { formatChangedAt } from '../../src/pages/formatChangedAt.ts';

const NOW = new Date('2026-08-05T12:00:00.000Z');

describe('formatChangedAt', () => {
  it('returns "Unknown" for null', () => {
    expect(formatChangedAt(null, NOW)).toBe('Unknown');
  });

  it('formats under an hour as minutes ago', () => {
    expect(formatChangedAt('2026-08-05T11:45:00.000Z', NOW)).toBe('15m ago');
  });

  it('formats under a day as hours ago', () => {
    expect(formatChangedAt('2026-08-05T09:00:00.000Z', NOW)).toBe('3h ago');
  });

  it('formats under a week as days ago, with correct pluralisation', () => {
    expect(formatChangedAt('2026-08-04T12:00:00.000Z', NOW)).toBe('1 day ago');
    expect(formatChangedAt('2026-08-01T12:00:00.000Z', NOW)).toBe('4 days ago');
  });

  it('formats a week or more ago as a short date', () => {
    expect(formatChangedAt('2026-07-01T12:00:00.000Z', NOW)).toBe('1 Jul');
  });

  it('never goes negative for a timestamp at or after now (clock skew)', () => {
    expect(formatChangedAt('2026-08-05T12:00:01.000Z', NOW)).toBe('1m ago');
  });
});
