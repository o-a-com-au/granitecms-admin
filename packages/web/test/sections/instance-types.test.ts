import { describe, expect, it } from 'vitest';
import { schemaTitle } from '../../src/sections/instance-types.ts';

describe('schemaTitle', () => {
  it('uses the schema\'s own "title" keyword when present', () => {
    expect(schemaTitle({ title: 'Hero' }, 'hero')).toBe('Hero');
  });

  it('falls back to the raw type slug when the schema has no title', () => {
    expect(schemaTitle({ type: 'object' }, 'social-proof')).toBe('social-proof');
  });

  it('falls back to the raw type slug when the schema is undefined (unknown type)', () => {
    expect(schemaTitle(undefined, 'mystery-type')).toBe('mystery-type');
  });

  it('falls back when title is present but blank', () => {
    expect(schemaTitle({ title: '   ' }, 'hero')).toBe('hero');
  });

  it('falls back when title is present but not a string', () => {
    expect(schemaTitle({ title: 42 }, 'hero')).toBe('hero');
  });
});
