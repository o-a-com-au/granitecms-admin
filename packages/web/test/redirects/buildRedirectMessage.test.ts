import { describe, expect, it } from 'vitest';
import {
  buildCreateRedirectMessage,
  buildDeleteRedirectMessage,
  buildUpdateRedirectMessage,
} from '../../src/redirects/buildRedirectMessage.ts';

describe('buildRedirectMessage', () => {
  it('create', () => {
    expect(buildCreateRedirectMessage('/old', '/new')).toBe('Add redirect from /old to /new');
  });

  it('update', () => {
    expect(buildUpdateRedirectMessage('/old', '/newer')).toBe('Update redirect from /old to /newer');
  });

  it('delete', () => {
    expect(buildDeleteRedirectMessage('/old')).toBe('Remove redirect from /old');
  });
});
