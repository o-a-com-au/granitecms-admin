import { describe, expect, it } from 'vitest';
import { ICON_RULE_TARGETS, iconNameForTitle } from '../../src/sections/section-icon-name.ts';
import { SECTION_ICON_NAMES } from '../../src/sections/SectionTypeIcon.tsx';

describe('iconNameForTitle', () => {
  it.each([
    ['Text columns', 'text-align-justify'],
    ['Fact list', 'list'],
    ['Quote', 'quote'],
    ['Statement', 'quote'],
    ['Contact', 'form'],
    ['Enquiry form', 'form'],
    ['FAQ', 'message-circle-question-mark'],
    ['FAQs', 'message-circle-question-mark'],
    ['Common questions', 'message-circle-question-mark'],
    ['Project hero', 'star'],
    ['Project feature', 'star'],
    ['Banner', 'flag'],
    ['Image band', 'image'],
    ['Media + Text', 'text-align-justify'],
    ['Video embed', 'play'],
    ['Gallery', 'layout-panel-top'],
  ])('maps %j to %j', (title, expected) => {
    expect(iconNameForTitle(title)).toBe(expected);
  });

  it('matches case-insensitively, since a title is whatever the theme wrote', () => {
    expect(iconNameForTitle('IMAGE BAND')).toBe('image');
    expect(iconNameForTitle('gallery')).toBe('layout-panel-top');
  });

  it('returns undefined when nothing matches, leaving the fallback to the icon component', () => {
    expect(iconNameForTitle('Massing model')).toBeUndefined();
    expect(iconNameForTitle('')).toBeUndefined();
  });

  it('every rule names an icon that is actually bundled', () => {
    for (const icon of ICON_RULE_TARGETS) {
      expect(SECTION_ICON_NAMES, `rule target "${icon}" is not bundled`).toContain(icon);
    }
  });
});
