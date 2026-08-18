import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapGooglePayloadToIdentity } from '../../src/auth/oauth-google.ts';

describe('mapGooglePayloadToIdentity', () => {
  it('prefers given_name/family_name when both are present - real provider-supplied names, not a heuristic split', () => {
    const identity = mapGooglePayloadToIdentity({
      email: 'jane@example.com',
      name: 'Jane Q Editor',
      given_name: 'Jane',
      family_name: 'Editor',
    });
    assert.deepEqual(identity, { email: 'jane@example.com', firstName: 'Jane', lastName: 'Editor' });
  });

  it('falls back to splitting the combined name when given_name/family_name are both missing', () => {
    const identity = mapGooglePayloadToIdentity({ email: 'jane@example.com', name: 'Jane Editor' });
    assert.deepEqual(identity, { email: 'jane@example.com', firstName: 'Jane', lastName: 'Editor' });
  });

  it('falls back to splitting even if only one of given_name/family_name is present', () => {
    const identity = mapGooglePayloadToIdentity({ email: 'jane@example.com', name: 'Jane Editor', given_name: 'Jane' });
    assert.deepEqual(identity, { email: 'jane@example.com', firstName: 'Jane', lastName: 'Editor' });
  });

  it('falls back to the email itself when no name is available at all', () => {
    const identity = mapGooglePayloadToIdentity({ email: 'jane@example.com' });
    assert.deepEqual(identity, { email: 'jane@example.com', firstName: 'jane@example.com', lastName: '' });
  });
});
