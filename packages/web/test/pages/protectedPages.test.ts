import { describe, expect, it } from 'vitest';
import {
  canChangePagePath,
  canDeletePage,
  canSetAsDraft,
  isHomePage,
  isNotFoundPage,
  isProtectedPage,
  notFoundPageWarning,
  NON_PARENT_PAGE_PATHS,
  HOME_PAGE_PATH,
  NOT_FOUND_PAGE_PATH,
} from '../../src/pages/protectedPages.ts';

const ORDINARY = 'pages/about.json';

describe('protectedPages', () => {
  it('recognises the two paths the agent renderer hardcodes, and nothing else', () => {
    expect(isHomePage(HOME_PAGE_PATH)).toBe(true);
    expect(isNotFoundPage(NOT_FOUND_PAGE_PATH)).toBe(true);
    expect(isProtectedPage(ORDINARY)).toBe(false);
    // A page merely named like one of them, nested elsewhere, is an
    // ordinary page - only these exact paths are special.
    expect(isProtectedPage('pages/about/index.json')).toBe(false);
    expect(isProtectedPage('pages/blog/404.json')).toBe(false);
  });

  it('blocks setting Home back to a draft, which would make the site root a 404', () => {
    expect(canSetAsDraft(HOME_PAGE_PATH)).toBe(false);
    expect(canSetAsDraft(ORDINARY)).toBe(true);
  });

  it('allows setting the 404 page to a draft - the renderer falls back rather than breaking', () => {
    expect(canSetAsDraft(NOT_FOUND_PAGE_PATH)).toBe(true);
  });

  it('blocks deleting Home only, not the 404 page', () => {
    expect(canDeletePage(HOME_PAGE_PATH)).toBe(false);
    expect(canDeletePage(NOT_FOUND_PAGE_PATH)).toBe(true);
    expect(canDeletePage(ORDINARY)).toBe(true);
  });

  it('blocks renaming or moving both, since each renderer lookup is by exact path', () => {
    expect(canChangePagePath(HOME_PAGE_PATH)).toBe(false);
    expect(canChangePagePath(NOT_FOUND_PAGE_PATH)).toBe(false);
    expect(canChangePagePath(ORDINARY)).toBe(true);
  });

  it('warns only for the 404 page, so a caller can append it unconditionally', () => {
    expect(notFoundPageWarning(NOT_FOUND_PAGE_PATH)).toContain('plain error message');
    expect(notFoundPageWarning(HOME_PAGE_PATH)).toBeNull();
    expect(notFoundPageWarning(ORDINARY)).toBeNull();
  });

  it('keeps both out of the parent list', () => {
    expect(NON_PARENT_PAGE_PATHS).toContain(HOME_PAGE_PATH);
    expect(NON_PARENT_PAGE_PATHS).toContain(NOT_FOUND_PAGE_PATH);
    expect(NON_PARENT_PAGE_PATHS).toHaveLength(2);
  });
});
