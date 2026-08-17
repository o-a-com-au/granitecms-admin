import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isStrongPassword, MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS_MESSAGE } from '../../src/auth/password-strength.ts';

describe('isStrongPassword', () => {
  it('rejects a password under the minimum length, even with all four character classes', () => {
    assert.equal(isStrongPassword('aA1!'), false);
  });

  it('rejects a password of sufficient length using only one character class', () => {
    assert.equal(isStrongPassword('aaaaaaaaaa'), false);
  });

  it('rejects a password using only two character classes', () => {
    assert.equal(isStrongPassword('aaaaaaaa11'), false);
  });

  it('accepts a password meeting the length floor with exactly three character classes', () => {
    assert.equal(isStrongPassword('Summer2026'), true);
  });

  it('accepts a password using all four character classes', () => {
    assert.equal(isStrongPassword('Summer2026!'), true);
  });

  it('MIN_PASSWORD_LENGTH is the length this module actually enforces', () => {
    const justUnder = 'aA1!'.repeat(MIN_PASSWORD_LENGTH).slice(0, MIN_PASSWORD_LENGTH - 1);
    const exact = 'aA1!'.repeat(MIN_PASSWORD_LENGTH).slice(0, MIN_PASSWORD_LENGTH);
    assert.equal(isStrongPassword(justUnder), false);
    assert.equal(isStrongPassword(exact), true);
  });

  it('PASSWORD_REQUIREMENTS_MESSAGE mentions the minimum length', () => {
    assert.match(PASSWORD_REQUIREMENTS_MESSAGE, new RegExp(String(MIN_PASSWORD_LENGTH)));
  });
});
