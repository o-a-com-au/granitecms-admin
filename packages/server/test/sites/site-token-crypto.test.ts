import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptSiteToken, decryptSiteToken } from '../../src/sites/site-token-crypto.ts';

describe('site-token-crypto', () => {
  it('a token round-trips through encrypt and decrypt', () => {
    const key = randomBytes(32);
    const encrypted = encryptSiteToken('a-real-site-token', key);

    assert.notEqual(encrypted, 'a-real-site-token');
    assert.equal(decryptSiteToken(encrypted, key), 'a-real-site-token');
  });

  it('two encryptions of the same plaintext produce different ciphertext (random IV per call)', () => {
    const key = randomBytes(32);
    const first = encryptSiteToken('same-token', key);
    const second = encryptSiteToken('same-token', key);

    assert.notEqual(first, second);
    assert.equal(decryptSiteToken(first, key), 'same-token');
    assert.equal(decryptSiteToken(second, key), 'same-token');
  });

  it('a legacy plaintext value (no v1: prefix) is returned unchanged, not treated as an error', () => {
    const key = randomBytes(32);
    assert.equal(decryptSiteToken('a-plaintext-token-from-before-this-feature', key), 'a-plaintext-token-from-before-this-feature');
  });

  it('decrypting with the wrong key fails loudly rather than silently returning garbage', () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const encrypted = encryptSiteToken('a-real-site-token', key);

    assert.throws(() => decryptSiteToken(encrypted, wrongKey));
  });
});
