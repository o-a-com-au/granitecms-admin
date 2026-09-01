import { describe, expect, it } from 'vitest';
import { allowedBlockTypes, buildDefaultSettings, dataDrivenLabel, schemaTitle } from '../../src/sections/instance-types.ts';

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

describe('dataDrivenLabel', () => {
  it('uses "headline" when present', () => {
    expect(dataDrivenLabel({ headline: 'Big Announcement' })).toBe('Big Announcement');
  });

  it('uses "heading" when there is no headline', () => {
    expect(dataDrivenLabel({ heading: 'Our Team' })).toBe('Our Team');
  });

  it('uses "name" when there is no headline or heading', () => {
    expect(dataDrivenLabel({ name: 'Jane Smith' })).toBe('Jane Smith');
  });

  it('uses "label" when none of headline/heading/name are present', () => {
    expect(dataDrivenLabel({ label: 'Learn more' })).toBe('Learn more');
  });

  it('observes the priority order headline > heading > name > label when several are present at once', () => {
    expect(dataDrivenLabel({ label: 'D', name: 'C', heading: 'B', headline: 'A' })).toBe('A');
    expect(dataDrivenLabel({ label: 'D', name: 'C', heading: 'B' })).toBe('B');
    expect(dataDrivenLabel({ label: 'D', name: 'C' })).toBe('C');
  });

  it('matches the settings key case-insensitively', () => {
    expect(dataDrivenLabel({ Heading: 'Our Team' })).toBe('Our Team');
    expect(dataDrivenLabel({ HEADLINE: 'Big Announcement' })).toBe('Big Announcement');
  });

  it('falls through to the next candidate when a higher-priority field is blank or not a string', () => {
    expect(dataDrivenLabel({ headline: '   ', heading: 'Our Team' })).toBe('Our Team');
    expect(dataDrivenLabel({ headline: 42, heading: 'Our Team' })).toBe('Our Team');
  });

  it('returns null when none of the four fields are present', () => {
    expect(dataDrivenLabel({ eyebrow: 'About', subheading: 'A team bio' })).toBeNull();
  });

  it('returns null for an empty settings object', () => {
    expect(dataDrivenLabel({})).toBeNull();
  });

  it('returns null when settings itself is undefined', () => {
    expect(dataDrivenLabel(undefined)).toBeNull();
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
