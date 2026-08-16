import { describe, expect, it } from 'vitest';
import { buildRestoreMessage } from '../../src/history/buildRestoreMessage.ts';

describe('buildRestoreMessage', () => {
  it('formats the commit date as day/short-month/year', () => {
    expect(buildRestoreMessage('2026-08-12T10:00:00.000Z')).toBe('Restore page to version from 12 Aug 2026');
  });
});
