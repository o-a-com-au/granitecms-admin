import { describe, expect, it } from 'vitest';
import { buildPublishMessage } from '../../src/editor/publishMessage.ts';

describe('buildPublishMessage', () => {
  it('combines the label with the given date, short-month formatted', () => {
    expect(buildPublishMessage('About', new Date(2026, 7, 11))).toBe('About - 11 Aug 2026');
  });

  it('uses a plain hyphen separator, not an em or en dash', () => {
    const message = buildPublishMessage('Home', new Date(2026, 0, 1));
    expect(message).not.toMatch(/[–—]/);
    expect(message).toBe('Home - 1 Jan 2026');
  });

  it('defaults to the current date when none is given', () => {
    const message = buildPublishMessage('Footer Menu');
    expect(message.startsWith('Footer Menu - ')).toBe(true);
    expect(message).toMatch(/^Footer Menu - \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });
});
