import { describe, expect, it } from 'vitest';
import { isStrongPassword, MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS_MESSAGE } from '../../src/auth/passwordStrength.ts';

describe('isStrongPassword', () => {
  it('rejects a password under the minimum length, even with all four character classes', () => {
    expect(isStrongPassword('aA1!')).toBe(false);
  });

  it('rejects a password of sufficient length using only one character class', () => {
    expect(isStrongPassword('aaaaaaaaaa')).toBe(false);
  });

  it('rejects a password using only two character classes', () => {
    expect(isStrongPassword('aaaaaaaa11')).toBe(false);
  });

  it('accepts a password meeting the length floor with exactly three character classes', () => {
    expect(isStrongPassword('Summer2026')).toBe(true);
  });

  it('accepts a password using all four character classes', () => {
    expect(isStrongPassword('Summer2026!')).toBe(true);
  });

  it('PASSWORD_REQUIREMENTS_MESSAGE mentions the minimum length', () => {
    expect(PASSWORD_REQUIREMENTS_MESSAGE).toContain(String(MIN_PASSWORD_LENGTH));
  });
});
