import { describe, expect, it } from 'vitest';
import { allowedBlockTypes, buildDefaultSettings, schemaTitle } from '../../src/sections/instance-types.ts';

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

describe('allowedBlockTypes', () => {
  it('returns the schema\'s own "allowedBlocks" array when present', () => {
    expect(allowedBlockTypes({ allowedBlocks: ['button', 'logo-mark'] })).toEqual(['button', 'logo-mark']);
  });

  it('returns undefined (unrestricted) when the schema has no allowedBlocks', () => {
    expect(allowedBlockTypes({ type: 'object' })).toBeUndefined();
  });

  it('returns undefined when the schema is undefined (unknown type)', () => {
    expect(allowedBlockTypes(undefined)).toBeUndefined();
  });

  it('returns undefined when allowedBlocks is present but not an array of strings', () => {
    expect(allowedBlockTypes({ allowedBlocks: 'button' })).toBeUndefined();
    expect(allowedBlockTypes({ allowedBlocks: [1, 2] })).toBeUndefined();
  });
});

describe('buildDefaultSettings', () => {
  it('populates settings from every property that declares a "default"', () => {
    const schema = {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'New Section' },
        subheading: { type: 'string' },
      },
    };
    expect(buildDefaultSettings(schema)).toEqual({ heading: 'New Section' });
  });

  it('is not required-specific - an optional property with a default is pre-filled too', () => {
    const schema = {
      type: 'object',
      required: ['label'],
      properties: {
        label: { type: 'string', default: 'Learn more' },
        style: { type: 'string', enum: ['primary', 'secondary'], default: 'primary' },
      },
    };
    expect(buildDefaultSettings(schema)).toEqual({ label: 'Learn more', style: 'primary' });
  });

  it('returns {} when no property declares a default', () => {
    const schema = { type: 'object', properties: { heading: { type: 'string' } } };
    expect(buildDefaultSettings(schema)).toEqual({});
  });

  it('returns {} when the schema is undefined (unknown type)', () => {
    expect(buildDefaultSettings(undefined)).toEqual({});
  });

  it('returns {} when the schema has no properties object', () => {
    expect(buildDefaultSettings({ type: 'object' })).toEqual({});
  });
});
