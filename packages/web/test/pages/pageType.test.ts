import { describe, expect, it } from 'vitest';
import { displayPageType, normalisePageType } from '../../src/pages/pageType.ts';

describe('normalisePageType', () => {
  it('lowercases, so one stray capital cannot split a type in two', () => {
    // The agent compares page_type case-sensitively, so "Article" would
    // simply not be found by ?pageType=article.
    expect(normalisePageType('Article')).toBe('article');
    expect(normalisePageType('PROJECT')).toBe('project');
  });

  it('trims, since a trailing space is invisible but not equal', () => {
    expect(normalisePageType('  article  ')).toBe('article');
  });

  it('falls back to "page" for an empty value, which the schema would reject', () => {
    expect(normalisePageType('')).toBe('page');
    expect(normalisePageType('   ')).toBe('page');
  });

  it('leaves an already-normal value untouched', () => {
    expect(normalisePageType('case-study')).toBe('case-study');
  });
});

describe('displayPageType', () => {
  it('capitalises the first letter only', () => {
    expect(displayPageType('article')).toBe('Article');
    // Not "Case-Study": a type is one token, not a title.
    expect(displayPageType('case-study')).toBe('Case-study');
  });

  it('leaves an empty value empty rather than inventing one', () => {
    expect(displayPageType('')).toBe('');
  });

  it('round-trips with normalisePageType', () => {
    for (const stored of ['page', 'project', 'case-study']) {
      expect(normalisePageType(displayPageType(stored))).toBe(stored);
    }
  });
});
