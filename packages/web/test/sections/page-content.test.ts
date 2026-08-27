import { describe, expect, it } from 'vitest';
import { buildFieldErrorMap } from '../../src/sections/page-content.ts';
import type { Instance } from '../../src/sections/instance-types.ts';

const SECTION_WITH_BLOCK: Instance[] = [
  {
    id: 'section-1',
    type: 'hero',
    settings: {},
    blocks: [{ id: 'block-1', type: 'button', settings: {} }],
  },
];

describe('buildFieldErrorMap', () => {
  it('keys a flat field error by its plain settings property name', () => {
    const map = buildFieldErrorMap(SECTION_WITH_BLOCK, [
      { path: '/sections/0/settings/heading', message: 'must NOT have fewer than 1 characters', keyword: 'minLength' },
    ]);

    expect(map['section-1']).toEqual({ heading: 'This field is required.' });
  });

  it('recurses into a nested block to key its own error under the block instance id', () => {
    const map = buildFieldErrorMap(SECTION_WITH_BLOCK, [
      { path: '/sections/0/blocks/0/settings/label', message: 'must NOT have fewer than 1 characters', keyword: 'minLength' },
    ]);

    expect(map['block-1']).toEqual({ label: 'This field is required.' });
    expect(map['section-1']).toBeUndefined();
  });

  // Ajv's own minLength/required wording is developer jargon a content
  // editor shouldn't have to parse - both collapse to one plain
  // message. Every other keyword (maximum/type/etc., covered by the
  // other tests here) keeps Ajv's own message untouched.
  it('replaces Ajv\'s own minLength/required wording with a plain message', () => {
    const map = buildFieldErrorMap(SECTION_WITH_BLOCK, [
      { path: '/sections/0/settings/heading', message: "must have required property 'heading'", keyword: 'required' },
    ]);

    expect(map['section-1']).toEqual({ heading: 'This field is required.' });
  });

  // The image field's own {url, focalX, focalY} shape is the first
  // real settings value with a nested path - an ajv error against one
  // of its own sub-properties produces a path like
  // .../settings/image/focalX, which has to collapse to the "image"
  // key so SectionSettingsForm's plain fieldErrors?.[key] lookup (keyed
  // by the field's own top-level property name) actually finds it.
  it('collapses a nested/object-field error path to the field\'s own top-level key', () => {
    const map = buildFieldErrorMap(SECTION_WITH_BLOCK, [
      { path: '/sections/0/settings/image/focalX', message: 'must be <= 1', keyword: 'maximum' },
    ]);

    expect(map['section-1']).toEqual({ image: 'must be <= 1' });
  });

  // Accepted, documented limitation (not fixed here): two distinct
  // errors under the same nested parent collapse to one map entry,
  // last-processed-wins - only one of the two messages is ever shown.
  it('two errors under the same nested parent collide - last one wins', () => {
    const map = buildFieldErrorMap(SECTION_WITH_BLOCK, [
      { path: '/sections/0/settings/image/focalX', message: 'focalX invalid', keyword: 'maximum' },
      { path: '/sections/0/settings/image/focalY', message: 'focalY invalid', keyword: 'maximum' },
    ]);

    expect(map['section-1']).toEqual({ image: 'focalY invalid' });
  });

  it('returns an empty map when there are no errors', () => {
    expect(buildFieldErrorMap(SECTION_WITH_BLOCK, null)).toEqual({});
    expect(buildFieldErrorMap(SECTION_WITH_BLOCK, [])).toEqual({});
  });

  it('ignores an error path outside any instance\'s own settings prefix', () => {
    const map = buildFieldErrorMap(SECTION_WITH_BLOCK, [{ path: '/title', message: 'bad title', keyword: 'type' }]);

    expect(map).toEqual({});
  });
});
