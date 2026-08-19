import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce length for GCM
// Version-prefixed so decryptSiteToken can tell an already-encrypted
// value from one written before this feature existed - a plaintext
// token never starts with this, so the two are unambiguous.
const PREFIX = 'v1:';

export function encryptSiteToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

// A stored value with no v1: prefix is a legacy plaintext token,
// written before this feature existed - returned unchanged rather
// than treated as an error. The next time that site's token is saved
// (rotation, or any other save() call), it gets encrypted going
// forward - a lazy migration, not a blocking one, so rolling this out
// needs no downtime and no separate migration script.
export function decryptSiteToken(stored: string, key: Buffer): string {
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const [ivB64, authTagB64, ciphertextB64] = stored.slice(PREFIX.length).split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('malformed encrypted site token');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]).toString('utf8');
}
