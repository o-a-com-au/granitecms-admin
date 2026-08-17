import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TIMEZONE, isValidTimezone } from '../../src/auth/timezone.ts';

describe('isValidTimezone', () => {
  it('accepts a real IANA zone name', () => {
    assert.equal(isValidTimezone('Australia/Sydney'), true);
  });

  it('accepts the default timezone', () => {
    assert.equal(isValidTimezone(DEFAULT_TIMEZONE), true);
  });

  it('rejects a made-up zone name', () => {
    assert.equal(isValidTimezone('Not/A_Real_Zone'), false);
  });

  it('rejects a plain UTC offset, not a zone name - Intl.DateTimeFormat itself accepts this without validating it, so a bare try/catch construction is not enough', () => {
    assert.equal(isValidTimezone('+10:00'), false);
  });

  it('rejects non-canonical casing, even though Intl.DateTimeFormat itself silently normalises it', () => {
    assert.equal(isValidTimezone('australia/sydney'), false);
  });

  it('rejects an empty string', () => {
    assert.equal(isValidTimezone(''), false);
  });
});
