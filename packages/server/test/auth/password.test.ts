import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DUMMY_HASH, DUMMY_SALT, hashPassword, verifyPassword } from '../../src/auth/password.ts';

describe('password', () => {
  it('a correct password verifies against its own hash', () => {
    const { hash, salt } = hashPassword('correct horse battery staple');
    assert.equal(verifyPassword('correct horse battery staple', hash, salt), true);
  });

  it('an incorrect password does not verify', () => {
    const { hash, salt } = hashPassword('correct horse battery staple');
    assert.equal(verifyPassword('wrong password', hash, salt), false);
  });

  it('two hashes of the same password use different salts and produce different hashes', () => {
    const first = hashPassword('correct horse battery staple');
    const second = hashPassword('correct horse battery staple');
    assert.notEqual(first.salt, second.salt);
    assert.notEqual(first.hash, second.hash);
  });

  it('DUMMY_HASH/DUMMY_SALT are always available so login can run verifyPassword for an unknown user', () => {
    assert.equal(typeof DUMMY_HASH, 'string');
    assert.equal(typeof DUMMY_SALT, 'string');
    assert.equal(verifyPassword('anything at all', DUMMY_HASH, DUMMY_SALT), false);
  });
});
