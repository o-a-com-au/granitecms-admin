import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatFullName, splitFullName } from '../../src/auth/full-name.ts';

describe('splitFullName', () => {
  it('splits a simple two-word name on the space', () => {
    assert.deepEqual(splitFullName('Jane Editor'), { firstName: 'Jane', lastName: 'Editor' });
  });

  it('a single word becomes firstName with an empty lastName', () => {
    assert.deepEqual(splitFullName('admin'), { firstName: 'admin', lastName: '' });
  });

  it('a name with a middle name puts everything after the first space into lastName', () => {
    assert.deepEqual(splitFullName('Mary Jane Watson'), { firstName: 'Mary', lastName: 'Jane Watson' });
  });

  it('trims leading/trailing whitespace and collapses internal whitespace around the split', () => {
    assert.deepEqual(splitFullName('  Jane   Editor  '), { firstName: 'Jane', lastName: 'Editor' });
  });

  it('an empty string produces empty firstName and lastName', () => {
    assert.deepEqual(splitFullName(''), { firstName: '', lastName: '' });
  });
});

describe('formatFullName', () => {
  it('joins firstName and lastName with a space', () => {
    assert.equal(formatFullName('Jane', 'Editor'), 'Jane Editor');
  });

  it('collapses to just firstName when lastName is empty, no trailing space', () => {
    assert.equal(formatFullName('admin', ''), 'admin');
  });

  it('is the inverse of splitFullName for a simple two-word name', () => {
    const { firstName, lastName } = splitFullName('Jane Editor');
    assert.equal(formatFullName(firstName, lastName), 'Jane Editor');
  });
});
